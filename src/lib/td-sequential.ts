export class TdSequential {
  private readonly _tdsResult: TdSequentialResult[];
  private readonly _ohlcv: OHLCV[]; // [ timestamp = 0, open = 1, high = 2, low = 3, close = 4, volume = 5 ]
  private resetSetupCounterAfterCountdownHit13 = true;
  private resetCountdownOnTdSt = true;
  private _buySellZone :[number, number] = [0, 0];

  constructor(ohlcv: OHLCV[]) {
    this._tdsResult = [];
    this._ohlcv = ohlcv;
    this.calculate();
  }

  public get result() {
    return this._tdsResult;
  }

  public get lastResult() {
    return this._tdsResult.slice(-1).pop();
  }

  public get buySellZone() {
    return this._buySellZone;
  }


  public calculate(): void {
    this._ohlcv.forEach((item, i) => {
      let resultObj = new TdSequentialResult();
      if (i >= 5) {
        resultObj.fromOtherResult(this._tdsResult[i - 1]);

        const closeLessThanCloseOf4BarsEarlier =
          this._ohlcv[i][4] < this._ohlcv[i - 4][4];
        const closeGreaterThanCloseOf4BarsEarlier =
          this._ohlcv[i][4] > this._ohlcv[i - 4][4];

        // Bearish Price Flip - a close greater than the close four bars earlier, immediately followed by a close less than the close four bars earlier.
        // Bullish Price Flip -  a close less than the close four bars before, immediately followed by a close greater than the close four bars earlier.
        resultObj.bearishFlip =
          this._ohlcv[i - 1][4] > this._ohlcv[i - 5][4] &&
          closeLessThanCloseOf4BarsEarlier;
        resultObj.bullishFlip =
          this._ohlcv[i - 1][4] < this._ohlcv[i - 5][4] &&
          closeGreaterThanCloseOf4BarsEarlier;

        // TD Buy Setup -  a bearish price flip, which indicates a switch from positive to negative momentum.
        // – After a bearish price flip, there must be nine consecutive closes, each one less than the corresponding close four bars earlier.
        // – Cancellation - If at any point a bar closes higher than the close four bars earlier the setup is canceled, and we are waiting for another price flip
        // - Setup perfection – the low of bars 8 or 9 should be lower than the low of bar 6 and bar 7 (if not satisfied expect new low/retest of the low).

        // TD buySetup
        if (
          resultObj.bearishFlip ||
          (this._tdsResult[i - 1].buySetupIndex > 0 &&
            closeLessThanCloseOf4BarsEarlier)
        ) {
          resultObj.buySetupIndex =
            ((this._tdsResult[i - 1].buySetupIndex + 1 - 1) % 9) + 1;
          // buy zone projection?
          if(resultObj.buySetupIndex === 1) {
            this._buySellZone = [item[2], item[3]];
          }
          resultObj.TdStBuy = Math.max(item[2], this._tdsResult[i - 1].TdStBuy);
        } else if (
          resultObj.bullishFlip ||
          (this._tdsResult[i - 1].sellSetupIndex > 0 &&
            closeGreaterThanCloseOf4BarsEarlier)
        ) {
          resultObj.sellSetupIndex =
            ((this._tdsResult[i - 1].sellSetupIndex + 1 - 1) % 9) + 1;
          // sell zone projection?
          if(resultObj.sellSetupIndex === 1) {
            this._buySellZone = [item[2], item[3]];
          }
          resultObj.TdStSell = this._tdsResult[i - 1].TdStSell === 0 ? item[3] : Math.max(
            item[3],
            this._tdsResult[i - 1].TdStSell
          );
        }

        // Did buy setup happen?
        if (resultObj.buySetupIndex === 9) {
          resultObj.buySetup = true;
          resultObj.sellSetup = false;
          resultObj.sellSetupPerfection = false;

          // - Buy Setup perfection – the low of bars 8 or 9 should be lower than the low of bar 6 and bar 7 (if not satisfied expect new low/retest of the low).
          resultObj.buySetupPerfection =
            (this._ohlcv[i - 1][3] < this._ohlcv[i - 3][3] &&
              this._ohlcv[i - 1][3] < this._ohlcv[i - 2][3]) ||
            // bar 9 low < 6 and 7
            (this._ohlcv[i][3] < this._ohlcv[i - 3][3] &&
              this._ohlcv[i][3] < this._ohlcv[i - 2][3]);
        }

        // Did sell setup happen?
        if (resultObj.sellSetupIndex === 9) {
          resultObj.sellSetup = true;
          resultObj.buySetup = false;
          resultObj.buySetupPerfection = false;

          // - Sell Setup perfection – the high of bars 8 or 9 should be greater than the high of bar 6 and bar 7 (if not satisfied expect new high/retest of the high).

          resultObj.sellSetupPerfection =
            (this._ohlcv[i - 1][2] > this._ohlcv[i - 3][2] &&
              this._ohlcv[i - 1][2] > this._ohlcv[i - 2][2]) ||
            // bar 9 high > 6 and 7
            (this._ohlcv[i][2] > this._ohlcv[i - 3][2] &&
              this._ohlcv[i][2] > this._ohlcv[i - 2][2]);
        }

        // TD Countdown compares the current close with the low/high two bars earlier, and you count 13 bars.
        // TD Buy Countdown
        // starts after the finish of a buy setup.
        // The close of bar 9 should be "less" than the low two bars earlier. If satisfied bar 9 of the setup becomes bar 1 of the countdown. If the condition is not met than bar 1 of the countdown is postponed until the conditions is satisfied, and you continue to count until there are a total of thirteen closes, each one less than, or equal to, the low two bars earlier.
        // Countdown qualifier - The low of Countdown bar thirteen must be less than, or equal to, the close of Countdown bar eight.
        // Countdown cancellation:
        // - A sell Setup appears. The price has rallied in the opposite direction and the market dynamic has changed.
        // - close above the highest high for the current buy Setup (break of TDST for the current Setup)
        // - recycle occurs ( new Setup in the same direction and recycle activated )

        // Setup Recycle - A second setup appears in the same direction before/on/after a Countdown - that usually means strength. The question is recycle and start a new Countdown? (there must be a price flip to divide the two setups or the first just continuous)
        // Compare the size of the two setups. The size is the difference between the true high and true low of a setup.
        // - if the second setup is equal or greater than the previous one , but less than 1.618 times its size, then Setup recycle will occur – the trend re-energize itself. Whichever Setup has the larger true range will become the active Setup.
        // - ignore setup recycle if the new setup is smaller or 1.618 times and more, bigger than the previous one – most probably price exhaustion area.
        resultObj = this.calculateTDBuyCountdown(resultObj, item, i);
        resultObj = this.calculateTDSellCountdown(resultObj, item, i);
      }
      this._tdsResult.push(resultObj);
    });
  }

  private calculateTDBuyCountdown(
    resultObj: TdSequentialResult,
    item: OHLCV,
    i: number
  ) {
    // TD Sell countdown
    if (
      // Sell setup appears
      (this._tdsResult[i - 1].sellSetup && resultObj.buySetup) ||
      // Close below TdStSell
      (this.resetCountdownOnTdSt && item[4] < resultObj.TdStSell)
    ) {
      resultObj.sellCountdownIndex = 0;
      resultObj.countdownResetForTdSt = true;
    } else if (resultObj.sellSetup) {
      if (item[4] > this._ohlcv[i - 2][2]) {
        resultObj.sellCountdownIndex =
          ((this._tdsResult[i - 1].sellCountdownIndex + 1 - 1) % 13) + 1;
        resultObj.countdownIndexIsEqualToPreviousElement = false;
      }
    }

    //If this item and the previous one were both 13, we set it to zero
    if (
      resultObj.sellCountdownIndex === 13 &&
      this._tdsResult[i - 1].sellCountdownIndex === 13
    ) {
      resultObj.sellCountdownIndex = 0;
    }

    //A.S: If countdown  hit 13, and we were counting another  setup, we reset that  setup
    if (
      this.resetSetupCounterAfterCountdownHit13 &&
      resultObj.sellCountdownIndex === 13 &&
      resultObj.sellSetupIndex > 0
    ) {
      resultObj.sellSetupIndex = 1;
    }

    // If we just reset the countdown
    if (
      resultObj.sellCountdownIndex !== 13 &&
      this._tdsResult[i - 1].sellCountdownIndex === 13
    ) {
      resultObj.sellSetup = false;
      resultObj.sellSetupPerfection = false;
      resultObj.sellCountdownIndex = 0;
    }
    return resultObj;
  }

  private calculateTDSellCountdown(
    resultObj: TdSequentialResult,
    item: OHLCV,
    i: number
  ) {
    //First we do cancellations:
    //If we were doing buy countdown, and now sell setup happens
    if (
      // Sell setup appears
      (this._tdsResult[i - 1].buySetup && resultObj.sellSetup) ||
      // Close above TDSTBuy
      (this.resetCountdownOnTdSt && item[4] > resultObj.TdStBuy)
    ) {
      resultObj.buyCountdownIndex = 0;
      resultObj.countdownResetForTdSt = true;
    } else if (resultObj.buySetup) {
      if (item[4] < this._ohlcv[i - 2][3]) {
        resultObj.buyCountdownIndex =
          ((this._tdsResult[i - 1].buyCountdownIndex + 1 - 1) % 13) + 1;
        resultObj.countdownIndexIsEqualToPreviousElement = false;
      }
    }

    // If this item and the previous one were both 13, we set it to zero
    if (
      resultObj.buyCountdownIndex === 13 &&
      this._tdsResult[i - 1].buyCountdownIndex === 13
    ) {
      resultObj.buyCountdownIndex = 0;
    }

    // A.S: If countdown  hit 13, and we were counting another buy setup, we reset that buy setup
    if (
      this.resetSetupCounterAfterCountdownHit13 &&
      resultObj.buyCountdownIndex === 13 &&
      resultObj.buySetupIndex > 0
    ) {
      resultObj.buySetupIndex = 1;
    }

    // If we just reset the countdown
    if (
      resultObj.buyCountdownIndex !== 13 &&
      this._tdsResult[i - 1].buyCountdownIndex === 13
    ) {
      resultObj.buySetup = false;
      resultObj.buySetupPerfection = false;
      resultObj.buyCountdownIndex = 0;
    }
    return resultObj;
  }
}

export class TdSequentialResult {
  public fromOtherResult(other: TdSequentialResult) {
    this.sellCountdownIndex = other.sellCountdownIndex;
    this.buyCountdownIndex = other.buyCountdownIndex;
    this.sellSetup = other.sellSetup;
    this.buySetup = other.buySetup;
    this.TdStBuy = other.TdStBuy;
    this.TdStSell = other.TdStSell;
    this.sellSetupPerfection = other.sellSetupPerfection;
    this.buySetupPerfection = other.buySetupPerfection;
  }

  public buySetupIndex = 0; // Counting buy setup
  public sellSetupIndex = 0; // Counting sell setup
  public buyCountdownIndex = 0; // Counting buy countdown
  public sellCountdownIndex = 0; // Counting sell countdown
  public countdownIndexIsEqualToPreviousElement = true; // Indicates that the countdown index on item [i] is the same as [i-1]

  public sellSetup = false; // Indicates Sell setup happened
  public buySetup = false; // Indicates Buy setup happened
  public sellSetupPerfection = false; // Indicates a perfect Sell Setup
  public buySetupPerfection = false; // Indicates a perfect Buy Setup

  public bearishFlip = false; // Indicates a bearish flip happened
  public bullishFlip = false; // Indicates a bullish flip happened

  public TdStBuy = 0; // highest high(usually the high of bar 1) of a buy setup
  public TdStSell = 0; // the lowest low(usually the low of bar 1) of sell setup
  public countdownResetForTdSt = false; // Indicates the countdown got reset due to observing TDST
}

/** [ timestamp, open, high, low, close, volume ] */
export type OHLCV = [number, number, number, number, number, number];
