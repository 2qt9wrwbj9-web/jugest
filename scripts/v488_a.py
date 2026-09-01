from pathlib import Path
p=Path('index.html');s=p.read_text()
def one(a,b,n):
 if s.count(a)!=1: raise SystemExit(f'{n}: {s.count(a)}')
 return s.replace(a,b,1)
s=one(s,'','noop') if False else s
s=s.replace('<!--\nv4.8.7 evidence-timeframe and independent-fact ranking policy:','<!--\nv4.8.8 run-finance and edit hotfix:\n- Run records capture shop rate, saved-medal investment, cash investment, collected medals and exchanged yen; actual coin difference, cash P/L and saved-medal delta are derived automatically.\n- Shop rate is remembered and copied into each run; an optional exchanged-medal override handles rounding/prize differences. Legacy records remain compatible.\n- Fixed the run-list Edit button under lazy rendering. Judgment/ranking and Launcher behavior are unchanged.\n\nv4.8.7 evidence-timeframe and independent-fact ranking policy:',1)
s=s.replace('ジャグラー設定判別 v4.8.7','ジャグラー設定判別 v4.8.8',1)
s=s.replace('ジャグラー・ハナハナ設定判別 <span style="font-size:11px;color:#b7ad9f">v4.8.7</span>','ジャグラー・ハナハナ設定判別 <span style="font-size:11px;color:#b7ad9f">v4.8.8</span>',1)
# Keep release-bearing backup/snapshot metadata in lockstep with the visible app version.
s=s.replace('appVersion:"4.8.7"','appVersion:"4.8.8"')
s=s.replace('return["4.8.7",p.shop','return["4.8.8",p.shop',1)
old='''        <div class="field full"><label>自分の実差枚（枚）</label><input id="LOG_ACTUAL_DIFF" type="number" inputmode="numeric" placeholder="例 +850"></div>\n        <div class="field"><label>現金収支（円）</label><input id="LOG_CASH_DIFF" type="number" inputmode="numeric" placeholder="例 -10000"></div>\n        <div class="field"><label>貯玉増減（枚）</label><input id="LOG_SAVED_DELTA" type="number" inputmode="numeric" placeholder="例 +1200"></div>\n      </div>\n      <div class="hint">現金収支＝その稼働の現金ベースの＋/−。貯玉増減＝会員カード残高が何枚増減したか。使わない項目は空欄でOK。</div>'''
new='''        <div class="field"><label>貸出（1000円あたり枚）</label><input id="LOG_LOAN_RATE" type="number" inputmode="decimal" min="0" step="0.01" placeholder="例 46"></div>\n        <div class="field"><label>交換（1000円あたり枚）</label><input id="LOG_EXCHANGE_RATE" type="number" inputmode="decimal" min="0" step="0.01" placeholder="例 52"></div>\n        <div class="field"><label>貯メダル投資（枚）</label><input id="LOG_SAVED_INVEST" type="number" inputmode="numeric" min="0" placeholder="例 500"></div>\n        <div class="field"><label>現金投資（円）</label><input id="LOG_CASH_INVEST" type="number" inputmode="numeric" min="0" step="1000" placeholder="例 10000"></div>\n        <div class="field"><label>回収枚数（枚）</label><input id="LOG_COLLECTED" type="number" inputmode="numeric" min="0" placeholder="例 1800"></div>\n        <div class="field"><label>換金額（円）</label><input id="LOG_EXCHANGED_YEN" type="number" inputmode="numeric" min="0" placeholder="例 20000"></div>\n        <div class="field full"><label>換金に使った枚数（補正・任意）</label><input id="LOG_EXCHANGE_COINS_OVERRIDE" type="number" inputmode="numeric" min="0" placeholder="通常は自動計算"></div>\n      </div>\n      <div class="hint">交換率は店舗ごとに記憶。実差枚・現金収支・貯メダル増減は自動計算する。</div>\n      <div class="run-stats" id="LOG_FINANCE_PREVIEW"></div>'''
if old not in s: raise SystemExit('finance form marker')
s=s.replace(old,new,1)
old='let obj={id:"shop_"+Date.now()+"_"+Math.random().toString(36).slice(2,6),name,savedCoinBase:0,savedCoinBaseUpdatedAt:Date.now(),createdAt:Date.now()};'
new='let obj={id:"shop_"+Date.now()+"_"+Math.random().toString(36).slice(2,6),name,savedCoinBase:0,savedCoinBaseUpdatedAt:Date.now(),loanCoinsPer1000:null,exchangeCoinsPer1000:null,financeRateUpdatedAt:0,createdAt:Date.now()};'
if old not in s: raise SystemExit('shop marker')
s=s.replace(old,new,1)
s=s.replace('actualDiff:"",cashDiff:"",savedCoinDelta:"",memo:"",entryType:snap.source==="live"?"pickup":"morning"','actualDiff:"",cashDiff:"",savedCoinDelta:"",financeVersion:2,loanCoinsPer1000:"",exchangeCoinsPer1000:"",savedInvestCoins:"",cashInvestYen:"",collectedCoins:"",exchangedYen:"",exchangeUsedCoinsOverride:"",memo:"",entryType:snap.source==="live"?"pickup":"morning"',1)
s=s.replace('actualDiff:"",cashDiff:"",savedCoinDelta:"",memo:"",entryType:"pickup"','actualDiff:"",cashDiff:"",savedCoinDelta:"",financeVersion:2,loanCoinsPer1000:"",exchangeCoinsPer1000:"",savedInvestCoins:"",cashInvestYen:"",collectedCoins:"",exchangedYen:"",exchangeUsedCoinsOverride:"",memo:"",entryType:"pickup"',1)
p.write_text(s)
