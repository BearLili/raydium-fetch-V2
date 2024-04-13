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
  MARKET_STATE_LAYOUT_V3,
  SPL_MINT_LAYOUT,
  TradeV2,
  jsonInfo2PoolKeys,
} = require('@raydium-io/raydium-sdk')
const { Connection, PublicKey } = require('@solana/web3.js')
const connection = new Connection('https://api.mainnet-beta.solana.com/')
// const programId = MAINNET_PROGRAM_ID?.AmmV4
// const serumProgramId = MAINNET_PROGRAM_ID?.OPENBOOK_MARKET
// const serumVersion = 10
// const marketVersion = 3

// init get AMM Keys
const formatAmmKeysById = async (id) => {
  const account = await connection.getAccountInfo(new PublicKey(id))
  if (account === null) throw Error(' get id info error ')
  const info = LIQUIDITY_STATE_LAYOUT_V4.decode(account.data)

  const marketId = info.marketId
  const marketAccount = await connection.getAccountInfo(marketId)
  if (marketAccount === null) throw Error(' get market info error')
  const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data)

  const lpMint = info.lpMint
  const lpMintAccount = await connection.getAccountInfo(lpMint)
  if (lpMintAccount === null) throw Error(' get lp mint info error')
  const lpMintInfo = SPL_MINT_LAYOUT.decode(lpMintAccount.data)

  return {
    id,
    baseMint: info.baseMint.toString(),
    quoteMint: info.quoteMint.toString(),
    lpMint: info.lpMint.toString(),
    baseDecimals: info.baseDecimal.toNumber(),
    quoteDecimals: info.quoteDecimal.toNumber(),
    lpDecimals: lpMintInfo.decimals,
    version: 4,
    programId: account.owner.toString(),
    authority: Liquidity.getAssociatedAuthority({ programId: account.owner }).publicKey.toString(),
    openOrders: info.openOrders.toString(),
    targetOrders: info.targetOrders.toString(),
    baseVault: info.baseVault.toString(),
    quoteVault: info.quoteVault.toString(),
    withdrawQueue: info.withdrawQueue.toString(),
    lpVault: info.lpVault.toString(),
    marketVersion: 3,
    marketProgramId: info.marketProgramId.toString(),
    marketId: info.marketId.toString(),
    marketAuthority: Market.getAssociatedAuthority({
      programId: info.marketProgramId,
      marketId: info.marketId,
    }).publicKey.toString(),
    marketBaseVault: marketInfo.baseVault.toString(),
    marketQuoteVault: marketInfo.quoteVault.toString(),
    marketBids: marketInfo.bids.toString(),
    marketAsks: marketInfo.asks.toString(),
    marketEventQueue: marketInfo.eventQueue.toString(),
    lookupTableAccount: PublicKey.default.toString(),
  }
}

// export Api poolIds[] => PoolInfo[]
const formatAmmKeysByIdToApi = async (poolIds = []) => {
  try {
    return await Promise.all(poolIds.map((poolId) => formatAmmKeysById(poolId)))
  } catch (error) {
    console.error('Error formatAmm Keys:', error)
    throw error
  }
}

// start to compute
const poolInfoToCompute = async (poolKeysList, config_tokenArr) => {
  try {
    return await compute(poolKeysList, config_tokenArr)
  } catch (err) {}
}

// compute function
const compute = async (poolKeysList, config_tokenArr) => {
  try {
    // Fetch information for all pools in one go
    const poolInfos = await TradeV2.fetchMultipleInfo({
      connection,
      pools: poolKeysList,
    })
    return Object.values(poolInfos).map((poolInfo, idx) => {
      let amount = config_tokenArr?.[idx]?.amount
      const poolKeys = poolKeysList[idx]

      const _poolKeys = jsonInfo2PoolKeys(poolKeys)
      const { baseMint, quoteMint } = _poolKeys

      let curr_in = baseMint
      let curr_out = quoteMint

      const in_decimal = poolInfo.baseDecimals
      const out_decimal = poolInfo.quoteDecimals

      const amountToken = new TokenAmount(new Token(_poolKeys?.programId, curr_in, in_decimal), amount, false)
      const currency = new Token(_poolKeys?.programId, curr_out, out_decimal)
      const slippage = new Percent(0, 100)

      const amountOut = Liquidity.computeAmountOut({
        poolKeys: _poolKeys,
        poolInfo,
        amountIn: amountToken,
        currencyOut: currency,
        slippage: slippage,
      })

      const amountIn = Liquidity.computeAmountIn({
        poolKeys: _poolKeys,
        poolInfo,
        amountOut: amountToken,
        currencyIn: currency,
        slippage: slippage,
      })

      return {
        result: [Object.values(amountOut), { ...Object.values(amountIn), fee: null }],
        timestamp: Date.now(),
      }
    })
  } catch (e) {
    console.error('compute error', e)
    return []
  }
}

// public fetchPrice function
const fetchPrice = async (config_tokenArr) => {
  const poolKeysList = await formatAmmKeysByIdToApi(config_tokenArr?.map((i) => i.pairKeys))
  const results = await poolInfoToCompute(poolKeysList, config_tokenArr)
  return results
}

module.exports = {
  fetchPrice,
  poolInfoToCompute,
}
