const config = require('./config/fetch_price_config.json');
const chainName = 'sol';
const bookPrefix = 'amm:';
const raydiumV4 = require('./raydiumV4/raydiumV4.js');
const raydiumCLMM = require('./raydiumCLMM/raydiumCLMM.js');

// Json data

// 转换价格数据格式
function priceDataTransfer({ result, tokenJson, timestamp }) {
  let [bidsInfo, asksInfo] = result || [[], []];
  let isV4 = tokenJson?.connector == 'raydiumV4';
  let _bidsPrice = bidsInfo?.[0]?.toFixed() / tokenJson?.amount;
  let _asksPrice = asksInfo?.[0]?.toFixed() / tokenJson?.amount;
  let asksPrice = isV4 ? _asksPrice?.toFixed(9) : _asksPrice?.toFixed(9);
  let bidsPrice = isV4 ? _bidsPrice?.toFixed(9) : _bidsPrice?.toFixed(9);

  let resultTokenInfo = {
    pairAddress: tokenJson?.pairKeys,
    asks: [[asksPrice, tokenJson?.amount, timestamp]],
    bids: [[bidsPrice, tokenJson?.amount, timestamp]],
    pair: [tokenJson?.baseAsset, tokenJson?.quoteAsset, 'token_in_key', 'token_out_key'],
    baseCurrency: tokenJson?.baseAsset,
    quoteCurrency: tokenJson?.quoteAsset,
    timestamp: timestamp,
    sequence: timestamp,
    connector: tokenJson?.connector,
    symbol: `${tokenJson?.baseAsset}/${tokenJson?.quoteAsset}`,
  };

  return resultTokenInfo;
}

// 主计算函数，避免递归调用
async function computeAndPushData(poolKeys, config_tokenArr, connector) {
  try {
    const poolInfoResult = await connector.poolInfoToCompute(poolKeys, config_tokenArr);

    const formattedData = poolInfoResult.map((item, idx) => {
      return { ...item, tokenJson: config_tokenArr[idx] };
    });

    let pushData = [];

    formattedData.forEach((item) => {
      let index = pushData.findIndex((p) => p.symbol == item?.tokenJson?.symbol);
      let priceData = priceDataTransfer(item);

      if (index >= 0) {
        pushData[index].value.push(priceData);
      } else {
        pushData.push({
          symbol: item?.tokenJson?.symbol,
          chainName: 'sol',
          value: [priceData],
        });
      }
    });

    console.log('\n');
    console.dir(pushData, { depth: null, colors: true });
    console.log('\n');

    return pushData;
  } catch (error) {
    console.error('Error during computations:', error);
    return [];
  }
}

// 主函数，用于启动计算和数据推送
async function main() {
  try {
    const amms = config?.amms || [];
    const config_tokenArr_V4 = amms.filter((item) => item.connector === 'raydiumV4');
    const config_tokenArr_CLMM = amms.filter((item) => item.connector === 'raydiumCLMM');

    const poolKeys_CLMM = config_tokenArr_CLMM.length ? await raydiumCLMM.fetchPoolInfos(config_tokenArr_CLMM) : [];
    const poolKeys_V4 = config_tokenArr_V4.length ? await raydiumV4.fetchPoolInfos(config_tokenArr_V4) : [];

    // 计算并推送数据，分别处理两种类型的 AMM 池子
    await computeAndPushData(poolKeys_CLMM, config_tokenArr_CLMM, raydiumCLMM);
    await computeAndPushData(poolKeys_V4, config_tokenArr_V4, raydiumV4);

    console.log('Computations completed successfully.');
  } catch (error) {
    console.error('Error during computations:', error);
  }
}

// 启动主函数
main();
