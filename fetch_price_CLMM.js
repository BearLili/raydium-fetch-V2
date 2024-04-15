const {
  ApiClmmPoolsItem,
  Clmm,
  fetchMultipleMintInfos,
  Percent,
  Token,
  TokenAmount,
  MAINNET_PROGRAM_ID,
} = require('@raydium-io/raydium-sdk')
const { TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token')
const { Keypair, PublicKey, Connection } = require('@solana/web3.js')
const { formatClmmKeysById } = require('./src/formatClmmKeysById')
const connection = new Connection('https://api.mainnet-beta.solana.com/')

async function swapOnlyCLMM(input) {
  // -------- pre-action: fetch Clmm pools info --------
  const clmmPools = [await formatClmmKeysById(input.targetPool)]
  debugger
  const { [input.targetPool]: clmmPoolInfo } = await Clmm.fetchMultiplePoolInfos({
    connection,
    poolKeys: clmmPools,
    chainTime: new Date().getTime() / 1000,
  })

    console.log([clmmPoolInfo.state]);
    debugger
  // -------- step 1: fetch tick array --------
  const tickCache = await Clmm.fetchMultiplePoolTickArrays({
    connection,
    poolKeys: [clmmPoolInfo.state],
    batchRequest: true,
  })

  // -------- step 2: calc amount out by SDK function --------
  // Configure input/output parameters, in this example, this token amount will swap 0.0001 USDC to RAY
  const result = Clmm.computeAmountOutFormat({
    poolInfo: clmmPoolInfo.state,
    tickArrayCache: tickCache[input.targetPool],
    amountIn: input.inputTokenAmount,
    currencyOut: input.outputToken,
    slippage: input.slippage,
    epochInfo: await connection.getEpochInfo(),
    token2022Infos: await fetchMultipleMintInfos({
      connection,
      mints: [
        ...clmmPools
          .map((i) => [
            { mint: i.mintA, program: i.mintProgramIdA },
            { mint: i.mintB, program: i.mintProgramIdB },
          ])
          .flat()
          .filter((i) => i.program === TOKEN_2022_PROGRAM_ID.toString())
          .map((i) => new PublicKey(i.mint)),
      ],
    }),
    catchLiquidityInsufficient: false,
  })
  console.log(result?.executionPrice.toFixed())
debugger
  return result
}

async function howToUse() {
  const inputToken = new Token(MAINNET_PROGRAM_ID.CLMM, 'So11111111111111111111111111111111111111112', 9)
  const outputToken = new Token(MAINNET_PROGRAM_ID.CLMM, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 6)
  const targetPool = '2QdhepnKRTLjjSqPL1PtKNwqrUkoLee5Gqs8bvZhRdMv' // USDC-RAY pool
  const inputTokenAmount = new TokenAmount(inputToken, 200)
  const slippage = new Percent(1, 100)

  swapOnlyCLMM({
    outputToken,
    targetPool,
    inputTokenAmount,
    slippage,
  }).then(({ minAmountOut }) => {
    /** continue with txids */
    console.log('txids', minAmountOut)
  })
}
howToUse()
