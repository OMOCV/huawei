# huawei-price-script
华为相关模块与脚本

## T-Mobile IMEI Compatibility Check

`scripts/tmobile-imei-check.js` can be used to verify if an IMEI is supported on the T-Mobile network.

### Usage

```bash
node scripts/tmobile-imei-check.js <IMEI>
```

The script queries T-Mobile's official IMEI check endpoint and outputs the compatibility result.
