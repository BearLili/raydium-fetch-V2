const {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  TransactionInstruction,
} = require('@solana/web3.js')
const bs58 = require('bs58')
const bip39 = require('bip39')
const { derivePath } = require('ed25519-hd-key')
const XLSX = require('xlsx')
const path = require('path')
const fs = require('fs')

const connect = new Connection('https://devnet.sonic.game', 'confirmed')

// 助记词
const mnemonic = 'radio village banner office miss assault require multiply aisle blind squeeze off'

// 使用 bip39 将助记词转换为种子
const seed = bip39.mnemonicToSeedSync(mnemonic)

// 从种子中导出密钥对
const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key
const pay = Keypair.fromSeed(derivedSeed)

let useFunction = async (pay) => {
  const myAccount = Keypair.generate()

  try {
    //获取最近区块信息，交易里面需要
    let key = { pubkey: pay.publicKey, isSigner: false, isWritable: false }
    let keys = [
      { pubkey: myAccount.publicKey, isSigner: false, isWritable: true },
      { pubkey: pay.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ]
    const data = Buffer.from('e121c6015a833e5a070000004f647973736579fcfffb0100000033', 'hex')
    // 构建数据负载（包括指令标识符和其他数据）
    // const data = Buffer.concat([
    //   instructionIdentifier,
    //   Buffer.from('...'), // 这里填入其他必要的数据
    // ])
    // let data = Buffer.from(['OpenMysteryBox'])
    //
    let instruction = new TransactionInstruction({
      programId: new PublicKey('721v6F7kPhKoysprtn5d41k6vUYjbsGsQcB4D3Ac8Goc'), //程序地址
      keys: keys, //合约里面使用的账号信息
      data: data, //传给合约的参数
    })

    // 获取最近区块信息，交易里面需要
    let latestBlockhash = await connect.getLatestBlockhash()
    let messageV0 = new TransactionMessage({
      payerKey: pay.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [instruction],
    }).compileToV0Message()

    // 生成交易，现在都用VersionedTransaction， Transaction类型已经不用了
    let transaction = new VersionedTransaction(messageV0)
    transaction.sign([pay]) // 签名
    let result = await connect.sendTransaction(transaction) // 发起交易
    debugger
    return { result }
  } catch (err) {
    console.log(err)
    debugger
  }
}

useFunction(pay)
