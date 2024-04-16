const { Liquidity, Market, Percent, Token, TokenAmount, LIQUIDITY_STATE_LAYOUT_V4, MARKET_STATE_LAYOUT_V3, SPL_MINT_LAYOUT, TradeV2, jsonInfo2PoolKeys } = require('@raydium-io/raydium-sdk');
const { Connection, PublicKey } = require('@solana/web3.js');
const connection = new Connection('https://api.mainnet-beta.solana.com/');

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

// 计算 PoolInfo 信息
const poolInfoToCompute = async (poolKeysList, config_tokenArr) => {
  try {
    const poolInfos = await TradeV2.fetchMultipleInfo({
      connection,
      pools: poolKeysList,
    });

    return Object.values(poolInfos).map((poolInfo, idx) => {
      const amount = config_tokenArr?.[idx]?.amount;
      const poolKeys = poolKeysList[idx];
      const _poolKeys = jsonInfo2PoolKeys(poolKeys);
      const { baseMint, quoteMint } = _poolKeys;
      const inDecimal = poolInfo.baseDecimals;
      const outDecimal = poolInfo.quoteDecimals;

      const amountToken = new TokenAmount(new Token(_poolKeys.programId, baseMint, inDecimal), amount, false);
      const currency = new Token(_poolKeys.programId, quoteMint, outDecimal);
      const slippage = new Percent(0, 100);

      const amountOut = Liquidity.computeAmountOut({
        poolKeys: _poolKeys,
        poolInfo,
        amountIn: amountToken,
        currencyOut: currency,
        slippage,
      });

      const amountIn = Liquidity.computeAmountIn({
        poolKeys: _poolKeys,
        poolInfo,
        amountOut: amountToken,
        currencyIn: currency,
        slippage,
      });

      return {
        result: [Object.values(amountOut), { ...Object.values(amountIn), fee: null }],
        timestamp: Date.now(),
      };
    });
  } catch (error) {
    console.error('Error computing pool info:', error);
    return [];
  }
};

// 公开的获取 PoolInfo 的函数
const fetchPoolInfos = async (config_tokenArr) => {
  const poolKeysList = await formatAmmKeysByIdToApi(config_tokenArr?.map(i => i.pairKeys));
  return poolKeysList
};

module.exports = {
  fetchPoolInfos,
  poolInfoToCompute
};
