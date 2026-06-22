const https = require('https');
https.get('https://interview-intelligence-engine-hbli75xw6.vercel.app', (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    const scripts = data.match(/src="([^"]+\.js)"/g);
    if (!scripts) {
      console.log('No scripts found');
      return;
    }
    scripts.forEach(s => {
      if(!s.includes('/app/')) return;
      const match = s.match(/"([^"]+)"/);
      if (!match) return;
      const url = 'https://interview-intelligence-engine-hbli75xw6.vercel.app' + match[1];
      https.get(url, r => {
        let js = '';
        r.on('data', d => js += d);
        r.on('end', () => {
          if(js.includes('localhost:8000')) console.log('FOUND localhost in', url);
          if(js.includes('onrender.com')) console.log('FOUND onrender in', url);
        });
      });
    });
  });
});
