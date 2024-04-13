const config = require('./config/fetch_price_config.json')
const { Connection, PublicKey } = require('@solana/web3.js')
const { Liquidity, Market, Percent, Token, TokenAmount } = require('@raydium-io/raydium-sdk')
// const redis = require('redis')

const chainName = 'sol'
const bookPrefix = 'amm:'

// redis
// let redisClient

// Json data
const config_tokenArr = config?.amms?.filter((i) => i?.connector == 'raydiumv4') || []

// init
async function init() {
  // redisClient = redis.createClient({ url: config.redisUrl })
  // await redisClient.connect()
  // base config
  const connection = new Connection('https://api.mainnet-beta.solana.com/')
  // token List
  const publicKeyArr = config_tokenArr.map((i) => new PublicKey(i?.pairKeys))
  //use 「pubilcKeyList」 and 「tokenList」, get the public keys;
  const pool_keys_array = await fetchPoolKeys(connection, publicKeyArr)

  return { connection, publicKeyArr, pool_keys_array }
}

// use 「pubilcKeyList」 and 「tokenList」 to get 「pool-KeysList」,include everyToken's Revece;
async function fetchPoolKeys(connection, poolId, version = 4) {
  const serumVersion = 10
  const marketVersion = 3

  const programId = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8')
  const serumProgramId = new PublicKey('srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX')

  const { state: LiquidityStateLayout } = Liquidity.getLayouts(version)

  try {
    const accountInfoList = (await connection.getMultipleAccountsInfo(poolId)) || []

    const resultList = await Promise.all(
      accountInfoList.map(async (account, idx) => {
        const fields = LiquidityStateLayout.decode(account?.data)
        const {
          status,
          baseMint,
          quoteMint,
          lpMint,
          openOrders,
          targetOrders,
          baseVault,
          quoteVault,
          marketId,
          baseDecimal,
          quoteDecimal,
          withdrawQueue,
          lpVault,
        } = fields

        const associatedPoolKeys = Liquidity.getAssociatedPoolKeys({
          version,
          marketVersion,
          marketId,
          baseMint,
          quoteMint,
          baseDecimals: baseDecimal.toNumber(),
          quoteDecimals: quoteDecimal.toNumber(),
          programId,
          marketProgramId: serumProgramId,
        })

        const marketInfo = await connection.getAccountInfo(marketId)
        const { state: MARKET_STATE_LAYOUT } = Market.getLayouts(marketVersion)
        const market = MARKET_STATE_LAYOUT.decode(marketInfo.data)

        const {
          baseVault: marketBaseVault,
          quoteVault: marketQuoteVault,
          bids: marketBids,
          asks: marketAsks,
          eventQueue: marketEventQueue,
        } = market

        const poolKeys = {
          id: poolId[idx],
          baseMint,
          quoteMint,
          lpMint,
          version,
          programId,
          authority: associatedPoolKeys.authority,
          openOrders,
          targetOrders,
          baseVault,
          quoteVault,
          withdrawQueue: status.isZero() ? PublicKey.default : withdrawQueue,
          lpVault: status.isZero() ? PublicKey.default : lpVault,
          marketVersion: serumVersion,
          marketProgramId: serumProgramId,
          marketId,
          marketAuthority: associatedPoolKeys.marketAuthority,
          marketBaseVault,
          marketQuoteVault,
          marketBids,
          marketAsks,
          marketEventQueue,
        }

        return poolKeys
      })
    )

    return resultList
  } catch (error) {
    console.error('Error processing data:', error)
    throw error
  }
}

// start to fetching,need created 「connection」「pool-KeysList」 and Token's base info;
async function fetchPoolInfo(pool_keys_array, config_tokenArr, connection) {
  try {
    // every public key into computer to back PriceInfo
    let new_pool_keys_array = pool_keys_array.map((pool_keys, idx) => {
      // pool_keys MintInfo
      const { baseMint, quoteMint } = pool_keys
      // Json about TokenObj
      const tokenJson = config_tokenArr?.[idx] || {}
      //
      const tokenInfo = {
        baseMint, //
        quoteMint, //
        base: tokenJson?.baseAsset, // baseName
        quote: tokenJson?.quoteAsset, // quoteName
      }
      return {
        pool_keys,
        tokenInfo,
        tokenJson,
      }
    })

    // start Time
    let beginCompute = new Date().getTime()
    const results = await compute(connection, pool_keys_array, new_pool_keys_array)

    let value = []

    results.forEach(({ result, tokenJson, timestamp }, idx) => {
      value.push(priceDataTransfer(result, tokenJson, timestamp))
    })

    // end Time
    let endTime = new Date().getTime()

    const hash_info = (await connection.getLatestBlockhashAndContext()).value
    let lastValidBlockHeight = hash_info.lastValidBlockHeight

    // pushData
    const pushData = {
      blockNumber: lastValidBlockHeight,
      ts: endTime,
      chainName: 'sol',
      value,
    }
    // pushing
    pushToRedis(pushData)
    //
    console.log(`\n`)
    console.dir(pushData, { depth: null, colors: true })
    // End
    console.log(`\n`, 'cost', endTime - beginCompute, 'ms')

    console.log(`\n -------------------------------------`)
    // ---

    // new Fetch
    await fetchPoolInfo(pool_keys_array, config_tokenArr, connection)
  } catch (err) {
    main()
  }
}

// use 「pool-KeysList」 compute to get price;
async function compute(connection, poolKeysList, new_pool_keys_array) {
  try {
    // Fetch information for all pools in one go
    const poolInfoList = await Liquidity.fetchMultipleInfo({
      connection,
      pools: poolKeysList,
    })

    const computeResultList = poolInfoList.map((poolInfo, idx) => {
      const poolKeys = poolKeysList[idx]
      const tokenInfo = new_pool_keys_array?.[idx]?.tokenInfo
      const tokenJson = new_pool_keys_array?.[idx]?.tokenJson

      const { baseMint, quoteMint } = tokenInfo
      const { slip = 0, amount } = tokenJson

      let curr_in = baseMint
      let curr_out = quoteMint

      if (curr_in.toBase58() !== poolKeys.baseMint.toBase58()) {
        ;[curr_in, curr_out] = [curr_out, curr_in] // Swap currencies
      }

      const in_decimal = poolInfo.baseDecimals
      const out_decimal = poolInfo.quoteDecimals

      const amountToken = new TokenAmount(new Token(poolKeys?.programId, curr_in, in_decimal), amount, false)
      const currency = new Token(poolKeys?.programId, curr_out, out_decimal)
      const slippage = new Percent(slip, 100)

      const amountOut = Liquidity.computeAmountOut({
        poolKeys,
        poolInfo,
        amountIn: amountToken,
        currencyOut: currency,
        slippage: slippage,
      })

      const amountIn = Liquidity.computeAmountIn({
        poolKeys,
        poolInfo,
        amountOut: amountToken,
        currencyIn: currency,
        slippage: slippage,
      })

      return {
        result: [Object.values(amountOut), { ...Object.values(amountIn), fee: null }],
        tokenInfo,
        tokenJson,
        timestamp: Date.now(),
      }
    })

    return computeResultList
  } catch (e) {
    console.error('compute error', e)
    return []
  }
}

// bot need's data;
function priceDataTransfer(result, tokenJson, timestamp) {
  let [bidsInfo, asksInfo] = result || [[], []]
  // [amountOut,minAmountOut,currentPrice,executionPrice,priceImpact,fee,amountIn];
  let bidsPrice = bidsInfo?.[0]?.toFixed() / tokenJson?.amount
  let asksPrice = asksInfo?.[0]?.toFixed() / tokenJson?.amount

  let resultTokenInfo = {
    pairAddress: tokenJson?.pairKeys,
    pairFee: bidsInfo?.[5]?.toFixed(),
    asks: [[asksPrice?.toFixed(9), tokenJson?.amount, timestamp]],
    bids: [[bidsPrice?.toFixed(9), tokenJson?.amount, timestamp]],
    pair: [tokenJson?.baseAsset, tokenJson?.quoteAsset, 'token_in_key', 'token_out_key'],
    baseCurrency: tokenJson?.baseAsset,
    quoteCurrency: tokenJson?.quoteAsset,
    timestamp: timestamp,
    sequence: timestamp,
    connector: 'raydium',
    symbol: `${tokenJson?.baseAsset}/${tokenJson?.quoteAsset}`,
  }

  return resultTokenInfo
}

// push to redis;
function pushToRedis(data) {
  const channel = `${bookPrefix}${chainName}`
  //   redisClient.setEx(channel, 60, JSON.stringify(data));
}

// main
async function main() {
  try {
    const { pool_keys_array, connection } = await init()
    // to fetch
    await fetchPoolInfo(pool_keys_array, config_tokenArr, connection)
  } catch (error) {
    console.error('Error during computations:', error)
  }
}

main()
