#!/usr/bin/env node
// Script to check IMEI compatibility with T-Mobile
// Usage: node scripts/tmobile-imei-check.js <IMEI>

const imei = process.argv[2];
if (!imei) {
  console.error('Usage: node scripts/tmobile-imei-check.js <IMEI>');
  process.exit(1);
}

async function checkImei(imei) {
  const url = 'https://www.t-mobile.com/resources/bring-your-own-phone/imei-checker';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      body: JSON.stringify({ imei })
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    throw error;
  }
}

checkImei(imei)
  .then(result => {
    console.log('IMEI check result:');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(err => {
    console.error('Failed to check IMEI:', err.message);
  });
