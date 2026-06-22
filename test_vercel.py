import urllib.request
import re

url = 'https://interview-intelligence-engine-hbli75xw6.vercel.app'
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
        
        # Find the JS bundles
        scripts = re.findall(r'src=\"([^\"]+\.js)\"', html)
        
        found_localhost = False
        found_render = False
        
        for s in scripts:
            js_url = s if s.startswith('http') else url + s
            try:
                with urllib.request.urlopen(js_url) as js_res:
                    js_content = js_res.read().decode('utf-8')
                    if 'localhost:8000' in js_content:
                        print(f'Found localhost:8000 in {s}')
                        found_localhost = True
                    if 'interview-intelligence-engine-1.onrender.com' in js_content:
                        print(f'Found onrender.com in {s}')
                        found_render = True
            except Exception as inner_e:
                pass
                
        print(f"Scan complete. Render found: {found_render} | Localhost found: {found_localhost}")
except Exception as e:
    print('Error:', e)
