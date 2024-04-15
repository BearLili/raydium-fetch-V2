const {
  Currency,
  LOOKUP_TABLE_CACHE,
  MAINNET_PROGRAM_ID,
  RAYDIUM_MAINNET,
  TOKEN_PROGRAM_ID,
  TxVersion,
  Liquidity,
  Market,
  Percent,
  Token,
  TokenAmount,
  LIQUIDITY_STATE_LAYOUT_V4,
  LIQUIDITY_STATE_LAYOUT_V5,
  MARKET_STATE_LAYOUT_V3,
  SPL_MINT_LAYOUT,
  TradeV2,
  Clmm,
  jsonInfo2PoolKeys,
  AmmConfigLayout,
  PoolInfoLayout,
  fetchMultipleMintInfos,
} = require('@raydium-io/raydium-sdk')
const { TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token')

const { Connection, PublicKey } = require('@solana/web3.js')
const connection = new Connection('https://api.mainnet-beta.solana.com/')

const getApiClmmPoolsItemStatisticsDefault = () => {
  return {
    volume: 0,
    volumeFee: 0,
    feeA: 0,
    feeB: 0,
    feeApr: 0,
    rewardApr: { A: 0, B: 0, C: 0 },
    apr: 0,
    priceMin: 0,
    priceMax: 0,
  }
}

const formatConfigInfo = async (id, account) => {
  const info = AmmConfigLayout.decode(account.data)
  return {
    id: id.toBase58(),
    index: info.index,
    protocolFeeRate: info.protocolFeeRate,
    tradeFeeRate: info.tradeFeeRate,
    tickSpacing: info.tickSpacing,
    fundFeeRate: info.fundFeeRate,
    fundOwner: info.fundOwner.toString(),
    description: '',
  }
}

const getMintProgram = async (mint) => {
  const account = await connection.getAccountInfo(mint)
  if (account === null) throw Error(' get id info error ')
  return account.owner
}

const getConfigInfo = async (configId) => {
  const account = await connection.getAccountInfo(configId)
  if (account === null) throw Error(' get id info error ')
  return formatConfigInfo(configId, account)
}

const formatClmmKeysById = async (id) => {
  const account = await connection.getAccountInfo(new PublicKey(id))
  if (account === null) throw Error(' get id info error ')
  const info = PoolInfoLayout.decode(account.data)
  return {
    id,
    mintProgramIdA: (await getMintProgram(info.mintA)).toString(),
    mintProgramIdB: (await getMintProgram(info.mintB)).toString(),
    mintA: info.mintA.toString(),
    mintB: info.mintB.toString(),
    vaultA: info.vaultA.toString(),
    vaultB: info.vaultB.toString(),
    mintDecimalsA: info.mintDecimalsA,
    mintDecimalsB: info.mintDecimalsB,
    ammConfig: await getConfigInfo(info.ammConfig),
    rewardInfos: await Promise.all(
      info.rewardInfos
        .filter((i) => !i.tokenMint.equals(PublicKey.default))
        .map(async (i) => ({
          mint: i.tokenMint.toString(),
          programId: (await getMintProgram(i.tokenMint)).toString(),
        }))
    ),
    tvl: 0,
    day: getApiClmmPoolsItemStatisticsDefault(),
    week: getApiClmmPoolsItemStatisticsDefault(),
    month: getApiClmmPoolsItemStatisticsDefault(),
    lookupTableAccount: PublicKey.default.toBase58(),
  }
}

// export Api poolIds[] => PoolInfo[]
const formatClmmKeysByIdToApi = async (poolIds = []) => {
  try {
    return await Promise.all(poolIds.map((poolId) => formatClmmKeysById(poolId)))
  } catch (error) {
    console.error('Error formatAmm Keys:', error)
    throw error
  }
}

// start to compute
const poolInfoToCompute = async (poolKeysList, config_tokenArr) => {
  try {
    const data = await compute(poolKeysList, config_tokenArr)
    return data
  } catch (err) {}
}

// compute function
const compute = async (clmmPools, config_tokenArr) => {
  try {
    // Fetch information for all pools in one go
    const clmmList = Object.values(
      await Clmm.fetchMultiplePoolInfos({ connection, poolKeys: clmmPools, chainTime: new Date().getTime() / 1000 })
    ).map((i) => i.state)

    const tickCache = await Clmm.fetchMultiplePoolTickArrays({
      connection,
      poolKeys: clmmList,
      batchRequest: true,
    })

    const resultList = await Promise.all(
      Object.values(clmmList).map(async (poolInfo, idx) => {
        let amount = config_tokenArr?.[idx]?.amount
        const {
          mintA: { mint: baseMint },
          mintB: { mint: quoteMint },
        } = poolInfo
        let curr_in = baseMint
        let curr_out = quoteMint
        const in_decimal = poolInfo?.mintA?.decimals
        const out_decimal = poolInfo?.mintB?.decimals
        const amountToken = new TokenAmount(new Token(MAINNET_PROGRAM_ID.CLMM, curr_in, in_decimal), amount, false)
        const currency = new Token(MAINNET_PROGRAM_ID.CLMM, curr_out, out_decimal)
        const slippage = new Percent(0, 100)

        const result = Clmm.computeAmountOutFormat({
          poolInfo: poolInfo,
          tickArrayCache: tickCache[config_tokenArr?.[idx]?.pairKeys],
          amountIn: amountToken,
          currencyOut: currency,
          slippage: slippage,
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
        const { amountOut, minAmountOut, currentPrice, executionPrice, priceImpact, fee } = result
        return {
          result: [
            Object.values({
              amountOut:amountOut?.amount,
              minAmountOut:minAmountOut?.amount,
              currentPrice,
              executionPrice,
              priceImpact,
              fee,
            }),
          ],
          timestamp: Date.now(),
        }
      })
    )
    return resultList
  } catch (e) {
    console.error('compute error', e)
    return []
  }
}

// public fetchPrice function
const fetchPrice = async (config_tokenArr) => {
  const poolKeysList = await formatClmmKeysByIdToApi(config_tokenArr?.map((i) => i.pairKeys))
  const results = await poolInfoToCompute(poolKeysList, config_tokenArr)
  return results
}

module.exports = {
  fetchPrice,
  poolInfoToCompute,
}
