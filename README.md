# TD Sequential in TS

TD Sequential indicator in Typescript

Experiment to port [this](https://github.com/ourarash/tdsequential) repo to typescript (starter) and make it compatible with
CCXT's `fetchOHLCV()` - method's response.

To use, simply clone, run `npm run build:main`, then `import { TDSequential } from 'build/main/index'` That should do.
I changed a litte bit of the code to get the TDSTSell filled - hopefully this it correct.

Thanks go out to [ourarash](https://github.com/ourarash) for his initial effort to implement this.

## License
[MIT](https://vjpr.mit-license.org/)
