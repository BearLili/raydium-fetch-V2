const {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} = require('@solana/web3.js')
const bs58 = require('bs58')
const bip39 = require('bip39')
const { derivePath } = require('ed25519-hd-key')
const XLSX = require('xlsx')
const path = require('path')
const fs = require('fs')

// 获取绝对路径
const keysFilePath = path.resolve(__dirname, './sonic.xlsx')
let output = path.resolve(__dirname, `./sonic_error_log_${new Date().getTime()}.txt`)

if (!fs.existsSync(keysFilePath)) {
  throw new Error(`File not found: ${keysFilePath}`)
}

const keysWorkbook = XLSX.readFile(keysFilePath, { cellStyles: true })
const keysSheet = keysWorkbook.Sheets[keysWorkbook.SheetNames[0]]
let keysData = XLSX.utils.sheet_to_json(keysSheet, { header: 1 })
//
const BATCH_SIZE = 2 // 每批处理2条记录
const TOTAL_ROWS = keysData.length // 总记录数
const maxCount = 3 // 交易次数
const maxFailures = 1 // 最大失败次数

const connect = new Connection('https://devnet.sonic.game', 'confirmed')

// 打乱数组顺序的函数
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}

// 打乱keysData
keysData = shuffle(keysData)

let getBalance = async (pay) => {
  let balance = await connect.getBalance(pay.publicKey)
  console.log('balance', `${balance / LAMPORTS_PER_SOL}Sol`) // 打印SOL余额（10亿lamports = 1SOL）
}

let toTransaction = async (pay, count) => {
  // 生成一个新的随机密钥对
  const keypair = Keypair.generate()
  // 获取公钥（用户地址）
  const publicKey = keypair.publicKey.toString()
  //
  let toPubkey = new PublicKey(publicKey)
  let amount = parseInt(10000000 * parseFloat(Math.random().toFixed(2)))
  //
  try {
    // 生成转账指令
    let instruction = SystemProgram.transfer({
      fromPubkey: pay.publicKey, // 转出账户公钥
      toPubkey: toPubkey, // 转入账号公钥
      lamports: amount, // 数量（10亿lamports = 1SOL）
    })

    // 获取最近区块信息，交易里面需要
    let latestBlockhash = await connect.getLatestBlockhash()
    let messageV0 = new TransactionMessage({
      payerKey: pay.publicKey, // 付gas费账户公钥
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [instruction], // 把指令添加到指令数组
    }).compileToV0Message()

    // 生成交易，现在都用VersionedTransaction， Transaction类型已经不用了
    let transaction = new VersionedTransaction(messageV0)
    transaction.sign([pay]) // 签名
    let result = await connect.sendTransaction(transaction) // 发起交易
    console.info(`【${pay.publicKey.toBase58()}】- 第${count + 1}次交易：`)
    console.log(`Success! To ${publicKey} Send ${amount / LAMPORTS_PER_SOL}Sol \n`)
    return { success: true, result }
  } catch (err) {
    console.info(`【${pay.publicKey.toBase58()}】- 第${count + 1}次交易：`)
    console.log(`Fail - error:`, err.message, '\n')
    return { success: false, error: err.message }
  }
}

let whileFun = async (pay, terminationLogs) => {
  let count = 0
  let failCount = 0
  while (count < maxCount && failCount < maxFailures) {
    let { success, result, error } = await toTransaction(pay, count)
    if (!success) {
      failCount++
    } else {
      count++
    }

    let time = 5000 + Math.random() * 5000
    await new Promise((resolve) => setTimeout(resolve, time))
  }
  if (failCount >= maxFailures) {
    const terminationLog = `Account ${pay.publicKey.toBase58()} | Success (${count}): reached max failures (${maxFailures}) and stopped at ${new Date().toISOString()}\n`
    terminationLogs.push(terminationLog)
    console.log(terminationLog)
  }
}

async function processBatch(startRow, endRow, processFunction, terminationLogs) {
  const keysData_s = keysData.slice(startRow, endRow)
  const promises = keysData_s.map(async (row) => {
    // 助记词
    const mnemonic = row[0]

    // 使用 bip39 将助记词转换为种子
    const seed = bip39.mnemonicToSeedSync(mnemonic)

    // 从种子中导出密钥对
    const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key
    const pay = Keypair.fromSeed(derivedSeed)

    // 打印私钥和公钥
    // console.log('Private Key:', bs58.encode(pay.secretKey))
    // console.log('Public Key:', pay.publicKey.toBase58())

    // 随机延迟执行
    const delay = 2000 + Math.random() * 2000
    await new Promise((resolve) => setTimeout(resolve, delay))
    return processFunction(pay, terminationLogs)
  })
  await Promise.all(promises)
}

async function processAllBatches(processFunction) {
  let terminationLogs = []
  for (let startRow = 0; startRow < TOTAL_ROWS; startRow += BATCH_SIZE) {
    const endRow = Math.min(startRow + BATCH_SIZE, TOTAL_ROWS)
    console.log(`Processing rows from ${startRow} to ${endRow}`)
    await processBatch(startRow, endRow, processFunction, terminationLogs)
  }
  console.log('All batches processed.')
  if (terminationLogs.length > 0) {
    console.error('Terminations:', terminationLogs)
    fs.writeFileSync(output, terminationLogs.join(''), 'utf8')
  }
}

processAllBatches(whileFun).catch((error) => {
  console.error('An error occurred:', error)
})
