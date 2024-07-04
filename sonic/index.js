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
const XLSX = require('xlsx')
const path = require('path')
const fs = require('fs')

// 获取绝对路径
const keysFilePath = path.resolve(__dirname, './sonic.xlsx')
let output = path.resolve(__dirname, `./sonic_${new Date().getTime()}.xlsx`)

if (!fs.existsSync(keysFilePath)) {
  throw new Error(`File not found: ${keysFilePath}`)
}

const keysWorkbook = XLSX.readFile(keysFilePath, { cellStyles: true })
const keysSheet = keysWorkbook.Sheets[keysWorkbook.SheetNames[0]]
const keysData = XLSX.utils.sheet_to_json(keysSheet, { header: 1 })

const BATCH_SIZE = 200 // 每批处理200条记录
const TOTAL_ROWS = keysData.length // 总记录数

// 助记词
const mnemonic = 'your mnemonic phrase here';

// 通过助记词生成种子
const seed = bip39.mnemonicToSeedSync(mnemonic);

// 从种子生成密钥对
const deriveSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
const keypair = Keypair.fromSeed(deriveSeed);

// const programId = new PublicKey('<REPLACE_WITH_YOUR_PROGRAM_ID>')
const connect = new Connection('https://devnet.sonic.game', 'confirmed')
const pay = Keypair.fromSecretKey(
  bs58.decode('2JtywfimSzJm6pRMzGweEkmwmHbj2Bv7BXsXqR9NfPUuDCJLryYncCqND1CLfzeuHJVfFovQQmcgxL8YGc6Z9rmj')
)

let getBalance = async () => {
  let balance = await connect.getBalance(pay.publicKey)
  console.log('balance', `${balance / LAMPORTS_PER_SOL}Sol`) //打印SOL余额（10亿lamports = 1SOL）
}

let toUseProgram = async () => {
  let key1 = { pubkey: pay.publicKey, isSigner: false, isWritable: false }
  let data = Buffer.from([0])
  let instruction2 = new TransactionInstruction({
    programId: new PublicKey('4eFvSUYCLMwVCx1aWyuCYf3mKo3UPgA4gNVAWViRVhk1'), //程序地址
    keys: [key1], //合约里面使用的账号信息
    data: data, //传给合约的参数
  })

  let messageV0 = new TransactionMessage({
    payerKey: pay.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: [instruction2],
  }).compileToV0Message()

  let t = new VersionedTransaction(messageV0)
  t.sign([pay])
  let result2 = await connect.sendTransaction(t) //返回交易哈希
  console.log('result', result2)
}

let toTransaction = async () => {
  // 生成一个新的随机密钥对
  const keypair = Keypair.generate()
  // 获取公钥（用户地址）
  const publicKey = keypair.publicKey.toString()
  //
  let toPubkey = new PublicKey(publicKey)
  let amount = parseInt(10000000 * parseFloat(Math.random().toFixed(2)))
  //
  try {
    //生成转账指令
    let instruction = SystemProgram.transfer({
      fromPubkey: pay.publicKey, //转出账户公钥
      toPubkey: toPubkey, //转入账号公钥
      lamports: amount, //数量（10亿lamports = 1SOL）
    })

    //获取最近区块信息，交易里面需要
    let latestBlockhash = await connect.getLatestBlockhash()
    let messageV0 = new TransactionMessage({
      payerKey: pay.publicKey, //付gas费账户公钥
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [instruction], //把指令添加到指令数组
    }).compileToV0Message()

    //生成交易，现在都用VersionedTransaction， Transaction类型已经不用了
    let transaction = new VersionedTransaction(messageV0)
    transaction.sign([pay]) //签名
    let result = await connect.sendTransaction(transaction) //发起交易
    console.log(`Success! To ${publicKey} Send ${amount / LAMPORTS_PER_SOL}Sol - Tx:`, result)
    return true
  } catch (err) {
    console.log(`Fail! To ${publicKey} Send ${amount / LAMPORTS_PER_SOL}Sol`)
    return false
  }
}

let count = 0
let whileFun = async (_isSuccess) => {
  if (count >= 90) {
    return
  }
  if (_isSuccess) count++

  console.info(`第${count}开始：`)
  let isSuccess = await toTransaction()
  let time = 5000 + Math.random() * 5000
  console.info(`第${count}结束, ${parseInt(time / 1000)}秒后下一次开始\n`)
  setTimeout(() => whileFun(isSuccess), time)
}

async function processBatch(startRow, endRow, processFunction) {
  const keysData_s = keysData.slice(startRow, endRow)
  const results = await Promise.all(
    keysData_s.map((row, index) => setTimeout(() => processFunction(true), 2000 + Math.random() * 2000))
  )
}

async function processAllBatches(processFunction) {
  for (let startRow = 0; startRow < TOTAL_ROWS; startRow += BATCH_SIZE) {
    const endRow = Math.min(startRow + BATCH_SIZE, TOTAL_ROWS)
    console.log(`Processing rows from ${startRow} to ${endRow}`)
    await processBatch(startRow, endRow, processFunction)
  }
  console.log('All batches processed.')
}

processAllBatches(whileFun).catch((error) => {
  console.error('An error occurred:', error)
})
