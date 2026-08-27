(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.HanaJudge=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION='1.0.1';
  const TRAD_SIDE=[
    [35.994,23.991,23.991,16.002,0.021],
    [23.190,34.781,16.789,25.191,0.049],
    [33.569,22.380,26.369,17.581,0.101],
    [21.556,32.336,18.365,27.545,0.197],
    [31.076,20.718,28.691,19.124,0.391],
    [24.805,24.805,24.805,24.805,0.781]
  ].map(r=>{const a=r.map(x=>x/100),z=a.reduce((x,y)=>x+y,0);return a.map(x=>x/z)});
  const TRAD_BIG_AFTER=[
    [3.67,2.87,1.92,1.28,0.01],
    [4.06,3.01,2.07,1.37,0.04],
    [4.30,3.53,2.33,1.50,0.06],
    [4.88,3.85,2.52,1.57,0.07],
    [5.36,4.10,2.67,1.74,0.20],
    [5.77,4.50,3.07,1.89,0.40]
  ].map(r=>r.map(x=>x/100));
  const BIG_WATER_6=[47.127,42.864,39.667,36.991,34.707,31.266];
  const BIG_MISS_6=[65536,32768,21845.33,16384,13107.2,10922.67];
  const RETRO_6=[6.19,7.41,8.02,9.34,10.52,12.93].map(x=>x/100);

  const style=(randomCherry,randomWater,cherryCherry,cherryWater,perfectCherry,perfectWater)=>({
    random:{cherryDenom:randomCherry,watermelonDenom:randomWater},
    cherry:{cherryDenom:cherryCherry,watermelonDenom:cherryWater},
    perfect:{cherryDenom:perfectCherry,watermelonDenom:perfectWater}
  });

  const MACHINES={
    houou:{
      key:'houou',name:'ハナハナホウオウ～天翔～',labels:['1','2','3','4','5','6'],settingValues:[1,2,3,4,5,6],
      big:[297,284,273,262,249,236],reg:[496,458,425,397,366,337],bell:[7.50,7.45,7.40,7.35,7.298,7.22],rate:[97,99,101,103,106,109],
      bigPay:240,regPay:120,bellPay:10,cherryPay:4,watermelonPay:6,replay:7.298,
      reverseStyles:style(72.02,286.25,48.01,286.25,48.01,160.23),
      bigGameDefault:24,bigWater:BIG_WATER_6,bigMiss:BIG_MISS_6,
      sideContext:'REG中サイドランプ',sideColors:['青','黄','緑','赤','虹'],sideProb:TRAD_SIDE,
      bigAfterName:'BIG後トップパネル',bigAfterColors:['青','黄','緑','赤','虹'],bigAfterProb:TRAD_BIG_AFTER,
      regAfterColors:['青','黄','緑','赤','虹'],regAfterMin:[2,3,4,5,6],retro:RETRO_6,
      sourceNote:'ボーナスは公表値。ベル・ボーナス中小役・ランプは解析/推定値を含む。'
    },
    king:{
      key:'king',name:'キングハナハナ',labels:['1','2','3','4','5','6'],settingValues:[1,2,3,4,5,6],
      big:[292,280,268,257,244,232],reg:[489,452,420,390,360,332],bell:[7.149,7.140,7.139,7.002,6.946,6.910],rate:[97,99,101,104,107,110],
      bigPay:260,regPay:120,bellPay:9,cherryPay:4,watermelonPay:6,replay:7.298,
      reverseStyles:style(72,285.83,48,285.83,48,160),
      bigGameDefault:20,bigWater:BIG_WATER_6,bigMiss:BIG_MISS_6,
      sideContext:'REG中サイドランプ',sideColors:['青','黄','緑','赤','虹'],sideProb:TRAD_SIDE,
      bigAfterName:'BIG後フェザーランプ',bigAfterColors:['青','黄','緑','赤','虹'],bigAfterProb:TRAD_BIG_AFTER,
      regAfterColors:['青','黄','緑','赤','虹'],regAfterMin:[2,3,4,5,6],retro:RETRO_6,
      sourceNote:'ボーナスは公表値。ベル・ボーナス中小役・ランプは解析/推定値を含む。'
    },
    dragon:{
      key:'dragon',name:'ドラゴンハナハナ～閃光～',labels:['1','2','3','4','5','6'],settingValues:[1,2,3,4,5,6],
      big:[256,246,235,224,212,199],reg:[642,585,537,489,442,399],bell:[7.131,7.093,7.090,7.016,6.973,6.970],rate:[97,99,101,104,107,110],
      bigPay:252,regPay:96,bellPay:9,cherryPay:4,watermelonPay:6,replay:7.298,
      reverseStyles:style(73.03,285.55,48.69,285.55,48.69,159.84),
      bigGameDefault:21,bigWater:BIG_WATER_6,bigMiss:BIG_MISS_6,
      sideContext:'REG中サイドランプ',sideColors:['青','黄','緑','赤','虹'],sideProb:TRAD_SIDE,
      bigAfterName:'BIG後フェザーランプ',bigAfterColors:['青','黄','緑','赤','虹'],bigAfterProb:TRAD_BIG_AFTER,
      regAfterColors:['青','黄','緑','赤','虹'],regAfterMin:[2,3,4,5,6],retro:RETRO_6,
      sourceNote:'ボーナスは公表値。ベル・ボーナス中小役・ランプは解析/推定値を含む。'
    },
    star:{
      key:'star',name:'スターハナハナ',labels:['1','2','3','4','5','6'],settingValues:[1,2,3,4,5,6],
      big:[270,262,252,240,229,218],reg:[387,354,322,293,267,242],bell:[6.358,6.303,6.300,6.260,6.204,6.200],rate:[97,99,101,104,107,110],
      bigPay:240,regPay:96,bellPay:8,cherryPay:4,watermelonPay:6,replay:7.298,
      reverseStyles:style(73.03,285.55,48.69,285.55,48.69,159.84),
      bigGameDefault:20,bigWater:BIG_WATER_6,bigMiss:BIG_MISS_6,
      sideContext:'REG中サイドランプ',sideColors:['青','黄','緑','赤','虹'],sideProb:TRAD_SIDE,
      bigAfterName:'BIG後フェザーランプ',bigAfterColors:['青','黄','緑','赤','虹'],bigAfterProb:TRAD_BIG_AFTER,
      regAfterColors:['青','黄','緑','赤','虹'],regAfterMin:[2,3,4,5,6],retro:RETRO_6,
      sourceNote:'ボーナスは公表値。ベル・ボーナス中小役・ランプは解析/推定値を含む。'
    },
    newkingv:(()=>{
      const side=TRAD_SIDE.slice(0,4).map(r=>r.slice());
      {const a=[25.01,20.72,28.69,24.80,0.78].map(x=>x/100),z=a.reduce((x,y)=>x+y,0);side.push(a.map(x=>x/z));}
      const bigAfter=TRAD_BIG_AFTER.slice(0,3).map(r=>r.slice());
      const p4=[1/35.67,1/26.75,1/27.74,1/39.42,1/374.5];
      const pv=[1/29.57,1/20.70,1/36.00,1/37.60,1/414];
      bigAfter.push(p4,pv);
      return{
        key:'newkingv',name:'ニューキングハナハナV',labels:['1','2','3','4','V'],settingValues:[1,2,3,4,5],
        big:[299.25,291.27,281.27,268.59,253.03],reg:[496.48,471.48,442.81,409.60,372.36],bell:[7.588,7.465,7.438,7.346,7.238],rate:[97,99,101,104,108],
        bigPay:312,regPay:130,bellPay:8,cherryPay:4,watermelonPay:10,replay:7.298,
        reverseStyles:style(72,285.83,48.01,285.83,48.01,160.23),
        bigGameDefault:14,bigWater:[31.21,28.49,25.21,21.85,19.86],bigMiss:[65536,32768,21845.33,16384,13107.2],
        sideContext:'BIG後半サイドランプ',sideColors:['青','黄','緑','赤','虹'],sideProb:side,
        bigAfterName:'BIG後ハイビスカスランプ',bigAfterColors:['青','黄','緑','紫','虹'],bigAfterProb:bigAfter,
        regAfterColors:['青','黄','緑','紫'],regAfterMin:[2,3,4,5],
        retro:[.0619,.0741,.0802,1/10.89,1/8.79],
        regWater:[102.40,81.35,72.16,51.44,48.51],regGameDefault:10,
        sourceNote:'ボーナスは公表値。ベル/BIG前半スイカ/設定4・Vの一部ランプ/REG中スイカは2026年実戦データ優先。設定1など未観測部分は推定値を補完。'
      };
    })()
  };

  const STYLE_PRIORS={unknown:{styles:['random','cherry','perfect'],weights:[.45,.45,.10]}};
  const STYLE_LABEL={unknown:'不明（適当45%・チェリー45%・完全10%の尤度混合）',random:'適当打ち',cherry:'チェリー狙い',perfect:'小役完全取得'};

  function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
  function finiteNum(x){return typeof x==='number'?Number.isFinite(x):(x!==''&&x!=null&&Number.isFinite(+x));}
  function nnum(x,d=0){return finiteNum(x)?+x:d;}
  function logBonus(G,B,R,pb,pr){
    const o=G-B-R,po=1-pb-pr;
    if(G<0||B<0||R<0||o<0||pb<=0||pr<=0||po<=0)return -Infinity;
    return B*Math.log(pb)+R*Math.log(pr)+o*Math.log(po);
  }
  function logBinom(k,n,p){
    if(n<0||k<0||k>n||p<0||p>1)return -Infinity;
    if(p===0)return k===0?0:-Infinity;
    if(p===1)return k===n?0:-Infinity;
    return k*Math.log(p)+(n-k)*Math.log1p(-p);
  }
  function logCategoricalCounts(counts,probs){
    if(counts.length!==probs.length)return -Infinity;
    let L=0;
    for(let i=0;i<counts.length;i++){
      const k=nnum(counts[i],0),p=probs[i];
      if(k<0||p<0)return -Infinity;
      if(k>0){if(p<=0)return -Infinity;L+=k*Math.log(p);}
    }
    return L;
  }
  function logMix(logs,weights){
    const m=Math.max(...logs);
    if(!Number.isFinite(m))return -Infinity;
    let z=0;for(let i=0;i<logs.length;i++)z+=weights[i]*Math.exp(logs[i]-m);
    return z>0?m+Math.log(z):-Infinity;
  }
  function normalizeLogs(logs){
    const finite=logs.filter(Number.isFinite);
    if(!finite.length)return logs.map(()=>0);
    const m=Math.max(...finite),w=logs.map(v=>Number.isFinite(v)?Math.exp(v-m):0),z=w.reduce((a,b)=>a+b,0);
    return z>0?w.map(v=>v/z):w.map(()=>0);
  }
  function meanSetting(m,q){return q.reduce((a,p,i)=>a+p*m.settingValues[i],0);}
  function metrics(m,q){
    const p4=q.reduce((a,p,i)=>a+(m.settingValues[i]>=4?p:0),0);
    const p5=q.reduce((a,p,i)=>a+(m.settingValues[i]>=5?p:0),0);
    const pTop=q[q.length-1]||0;
    const odd=q.reduce((a,p,i)=>a+(m.settingValues[i]%2===1?p:0),0);
    return{expectedSetting:meanSetting(m,q),p4,p5,pTop,odd,even:1-odd};
  }
  function bonusLogs(m,G,B,R){return m.big.map((d,i)=>logBonus(G,B,R,1/d,1/m.reg[i]));}
  function bellActualLogs(m,G,bellCount){return m.bell.map(d=>logBinom(bellCount,G,1/d));}
  function styleSpec(m,styleName){return m.reverseStyles[styleName]||m.reverseStyles.random;}

  function reverseBellKnown(m,G,B,R,D,styleName){
    const st=styleSpec(m,styleName),pr=1/m.replay,pc=1/st.cherryDenom,pw=1/st.watermelonDenom;
    const bonus=m.bigPay*B+m.regPay*R;
    const expectedOther=3*(G*pr)+m.cherryPay*(G*pc)+m.watermelonPay*(G*pw);
    const varOther=9*G*pr*(1-pr)+m.cherryPay*m.cherryPay*G*pc*(1-pc)+m.watermelonPay*m.watermelonPay*G*pw*(1-pw);
    const rows=[],bellLogs=[];
    for(let i=0;i<m.bell.length;i++){
      // G is the normal-game trial count. Do not add a fixed bonus-alignment bet here:
      // HANA announcement timing can be same-game or next-game and the corresponding normal-game bet is already part of G.
      const inferred=(3*G+D-bonus-expectedOther)/m.bellPay;
      const pb=1/m.bell[i],mean=G*pb,varBell=G*pb*(1-pb),varInferred=varOther/(m.bellPay*m.bellPay),variance=Math.max(1e-9,varBell+varInferred);
      const z=inferred-mean;
      const L=-.5*z*z/variance-.5*Math.log(variance);
      bellLogs.push(L);
      rows.push({label:m.labels[i],inferredBell:inferred,inferredDenom:inferred>0?G/inferred:Infinity,theoryDenom:m.bell[i],sdInferred:Math.sqrt(varInferred),style:styleName});
    }
    return{bellLogs,rows,expectedOther,style:styleName};
  }

  function reverseBell(m,G,B,R,D,styleName='unknown'){
    if(!G||!finiteNum(D))return null;
    if(styleName!=='unknown'){
      const c=reverseBellKnown(m,G,B,R,D,styleName),q=normalizeLogs(c.bellLogs);
      const vbar=c.rows.reduce((a,r,i)=>a+q[i]*r.inferredBell,0);
      const mixVar=c.rows.reduce((a,r,i)=>a+q[i]*(r.sdInferred*r.sdInferred+(r.inferredBell-vbar)**2),0);
      return{...c,q,inferredBell:vbar,inferredDenom:vbar>0?G/vbar:Infinity,sd:Math.sqrt(mixVar),unknownMix:false};
    }
    const spec=STYLE_PRIORS.unknown,cores=spec.styles.map(s=>reverseBellKnown(m,G,B,R,D,s));
    const bellLogs=m.labels.map((_,i)=>logMix(cores.map(c=>c.bellLogs[i]),spec.weights));
    const q=normalizeLogs(bellLogs);
    const rows=m.labels.map((label,i)=>{
      const ls=cores.map(c=>c.bellLogs[i]),mx=Math.max(...ls),raw=ls.map((v,j)=>spec.weights[j]*Math.exp(v-mx)),z=raw.reduce((a,b)=>a+b,0),sw=raw.map(v=>v/z);
      const inferred=cores.reduce((a,c,j)=>a+sw[j]*c.rows[i].inferredBell,0);
      const variance=cores.reduce((a,c,j)=>a+sw[j]*(c.rows[i].sdInferred**2+(c.rows[i].inferredBell-inferred)**2),0);
      return{label,inferredBell:inferred,inferredDenom:inferred>0?G/inferred:Infinity,theoryDenom:m.bell[i],sdInferred:Math.sqrt(variance),style:'unknown'};
    });
    const vbar=rows.reduce((a,r,i)=>a+q[i]*r.inferredBell,0);
    const mixVar=rows.reduce((a,r,i)=>a+q[i]*(r.sdInferred*r.sdInferred+(r.inferredBell-vbar)**2),0);
    return{bellLogs,rows,q,inferredBell:vbar,inferredDenom:vbar>0?G/vbar:Infinity,sd:Math.sqrt(mixVar),unknownMix:true,style:'unknown'};
  }

  function validateCoreInput(m,input){
    const warnings=[];
    const G=nnum(input.G),B=nnum(input.bb),R=nnum(input.rb);
    if(G<0||B<0||R<0)warnings.push('G/BIG/REGは0以上で入力してね。');
    if(B+R>G)warnings.push('BIG+REGが通常Gを超えてるよ。');
    if(finiteNum(input.bell)&&(+input.bell<0||+input.bell>G))warnings.push('実測ベル回数を確認してね。');
    return warnings;
  }

  function numericJudge(key,input={}){
    const m=MACHINES[key];if(!m)throw new Error('unknown machine: '+key);
    const G=nnum(input.G),B=nnum(input.bb),R=nnum(input.rb),warnings=validateCoreInput(m,input);
    if(!G)return{machine:key,labels:m.labels.slice(),q:m.labels.map(()=>0),metrics:null,warnings,mode:'empty'};
    const bLogs=bonusLogs(m,G,B,R);
    let logs=bLogs.slice(),mode='bonus_only',reverse=null,bellMode='none';
    if(finiteNum(input.bell)){
      const k=+input.bell;const bl=bellActualLogs(m,G,k);logs=logs.map((v,i)=>v+bl[i]);mode='actual_bell';bellMode='actual';
    }else if(finiteNum(input.diff)){
      reverse=reverseBell(m,G,B,R,+input.diff,input.style||'unknown');
      if(reverse){logs=logs.map((v,i)=>v+reverse.bellLogs[i]);mode='reverse_bell';bellMode='reverse';}
    }
    const q=normalizeLogs(logs),met=metrics(m,q);
    if(reverse){
      const lo=Math.max(1,reverse.inferredBell-1.96*reverse.sd),hi=reverse.inferredBell+1.96*reverse.sd;
      reverse.range={countLow:lo,countHigh:hi,denomLow:hi>0?G/hi:Infinity,denomHigh:lo>0?G/lo:Infinity};
      if(reverse.rows.some(r=>r.inferredBell<0||r.inferredBell>G))warnings.push('差枚からのベル逆算が物理範囲を外れる設定があるよ。G/BIG/REG/差枚を確認してね。');
    }
    return{machine:key,labels:m.labels.slice(),q,metrics:met,warnings,mode,bellMode,reverse,logs,bonusQ:normalizeLogs(bLogs)};
  }

  function liveJudge(key,input={}){
    const m=MACHINES[key];if(!m)throw new Error('unknown machine: '+key);
    const G=nnum(input.G),B=nnum(input.bb),R=nnum(input.rb),warnings=validateCoreInput(m,input);
    if(!G)return{machine:key,labels:m.labels.slice(),numericQ:m.labels.map(()=>0),q:m.labels.map(()=>0),metrics:null,numericMetrics:null,warnings,factors:[]};
    let logs=bonusLogs(m,G,B,R),factors=[{id:'bonus',label:'BIG / REG',used:true}];
    let reverse=null;
    if(finiteNum(input.bell)){
      const k=+input.bell;logs=logs.map((v,i)=>v+bellActualLogs(m,G,k)[i]);factors.push({id:'bell',label:'実測ベル',used:true,detail:`${k}回`});
      if(finiteNum(input.diff))factors.push({id:'diff',label:'差枚逆算ベル',used:false,detail:'実測ベル優先のため未使用'});
    }else if(finiteNum(input.diff)){
      reverse=reverseBell(m,G,B,R,+input.diff,input.style||'unknown');
      if(reverse){logs=logs.map((v,i)=>v+reverse.bellLogs[i]);factors.push({id:'bell_reverse',label:'差枚から推定ベル',used:true,detail:STYLE_LABEL[input.style||'unknown']});}
    }
    const numericLogs=logs.slice(),numericQ=normalizeLogs(numericLogs),numericMetrics=metrics(m,numericQ);

    const bigGames=nnum(input.bigGames),bigWater=nnum(input.bigWater),bigMiss=nnum(input.bigMiss);
    if(bigGames>0&&(finiteNum(input.bigWater)||finiteNum(input.bigMiss))){
      if(bigWater+bigMiss>bigGames)warnings.push('BIG中スイカ+ハズレがBIG中対象Gを超えてるよ。');
      else{
        logs=logs.map((v,i)=>{
          const pw=1/m.bigWater[i],pm=1/m.bigMiss[i],prest=1-pw-pm;
          return v+logCategoricalCounts([bigWater,bigMiss,bigGames-bigWater-bigMiss],[pw,pm,prest]);
        });
        factors.push({id:'big_small',label:'BIG中スイカ・ハズレ',used:true,detail:`${bigGames}G / スイカ${bigWater} / ハズレ${bigMiss}`});
      }
    }

    const sideCounts=(input.sideCounts||[]).map(x=>nnum(x));
    const sideN=sideCounts.reduce((a,b)=>a+b,0);
    if(sideN>0){
      const isRegSide=m.sideContext.startsWith('REG'),maxN=isRegSide?R:B,bonusLabel=isRegSide?'REG':'BIG';
      if(sideN>maxN){
        warnings.push(`${m.sideContext}のサンプル数が${bonusLabel}回数を超えてるよ。ランプ判別には使ってないよ。`);
        factors.push({id:'side',label:m.sideContext,used:false,detail:`記録 ${sideN}/${maxN}${bonusLabel}（不整合）`});
      }else{
        logs=logs.map((v,i)=>v+logCategoricalCounts(sideCounts,m.sideProb[i]));
        factors.push({id:'side',label:m.sideContext,used:true,detail:`記録 ${sideN}/${maxN}${bonusLabel}`});
      }
    }

    const normalBigTrials=nnum(input.normalBigTrials);
    const bigAfterCounts=(input.bigAfterCounts||[]).map(x=>nnum(x));
    const nonWhite=bigAfterCounts.reduce((a,b)=>a+b,0);
    if(normalBigTrials>0||nonWhite>0){
      const maxNormalBig=Math.max(0,B-(input.firstBigSeparated?1:0));
      const badTrials=normalBigTrials>maxNormalBig,badColors=nonWhite>normalBigTrials;
      if(badTrials)warnings.push(`${m.bigAfterName}の対象BIG回数が基本データのBIG回数を超えてるよ。ランプ判別には使ってないよ。`);
      if(badColors)warnings.push(`${m.bigAfterName}の色付き回数が対象BIG回数を超えてるよ。ランプ判別には使ってないよ。`);
      if(badTrials||badColors){
        factors.push({id:'big_after',label:m.bigAfterName,used:false,detail:`対象${normalBigTrials}/${maxNormalBig}BIG・色付き${nonWhite}（不整合）`});
      }else if(normalBigTrials>0){
        const white=normalBigTrials-nonWhite;
        logs=logs.map((v,i)=>{
          const probs=m.bigAfterProb[i],pwhite=Math.max(0,1-probs.reduce((a,b)=>a+b,0));
          return v+logCategoricalCounts([...bigAfterCounts,white],[...probs,pwhite]);
        });
        factors.push({id:'big_after',label:m.bigAfterName,used:true,detail:`通常BIG ${normalBigTrials}/${maxNormalBig}回（白${white}回）`});
      }
    }
    if(input.firstBigSeparated){
      if(B<1)warnings.push('初回BIGを別カウントにしてるけど、基本データのBIGが0回だよ。');
      factors.push({id:'first_big',label:'設定変更後の初回BIGランプ',used:false,detail:`${input.firstBigColor||'色未入力'} / 通常BIG後判別から除外`});
    }

    let minValue=1,minLabel=null;
    const regAfterCounts=(input.regAfterCounts||[]).map(x=>nnum(x)),regAfterN=regAfterCounts.reduce((a,b)=>a+b,0),badRegAfter=regAfterN>R;
    if(badRegAfter)warnings.push('REG後の色付きランプ回数が基本データのREG回数を超えてるよ。濃厚示唆には使ってないよ。');
    for(let j=0;j<m.regAfterMin.length;j++)if(regAfterCounts[j]>0&&m.regAfterMin[j]>=minValue){minValue=m.regAfterMin[j];minLabel=m.regAfterColors[j];}
    if(minLabel){
      if(badRegAfter){
        factors.push({id:'reg_after',label:'REG後ランプ（濃厚をハード制約）',used:false,detail:`色付き ${regAfterN}/${R}REG（不整合）`});
      }else{
        logs=logs.map((v,i)=>m.settingValues[i]>=minValue?v:-Infinity);
        factors.push({id:'reg_after',label:'REG後ランプ（濃厚をハード制約）',used:true,detail:`色付き ${regAfterN}/${R}REG・最強${minLabel} → ${minValue===5&&m.labels.at(-1)==='V'?'設定V':'設定'+minValue}以上のみ`});
      }
    }

    const retroTrials=nnum(input.retroTrials),retroHits=nnum(input.retroHits);
    if(retroTrials>0||retroHits>0){
      if(retroHits>retroTrials)warnings.push('レトロサウンド発生回数が条件達成回数を超えてるよ。');
      else if(retroTrials>0){logs=logs.map((v,i)=>v+logBinom(retroHits,retroTrials,m.retro[i]));factors.push({id:'retro',label:'レトロサウンド',used:true,detail:`${retroHits}/${retroTrials}`});}
    }

    if(m.regWater){
      const rg=nnum(input.regGames),rw=nnum(input.regWater);
      if(rg>0||rw>0){
        if(rw>rg)warnings.push('REG中スイカ回数がREG中対象Gを超えてるよ。');
        else if(rg>0){logs=logs.map((v,i)=>v+logBinom(rw,rg,1/m.regWater[i]));factors.push({id:'reg_water',label:'REG中スイカ',used:true,detail:`${rw}/${rg}G`});}
      }
    }

    const q=normalizeLogs(logs),met=metrics(m,q);
    if(!q.some(x=>x>0))warnings.push('入力された濃厚示唆が矛盾して、候補設定がなくなってるよ。');
    return{machine:key,labels:m.labels.slice(),q,metrics:met,numericQ,numericMetrics,warnings,factors,reverse,logs,numericLogs};
  }

  function machineConfig(key){
    const m=MACHINES[key];if(!m)return null;
    return JSON.parse(JSON.stringify(m));
  }

  function defaultBigGames(key,bb){const m=MACHINES[key];return m?Math.max(0,nnum(bb))*m.bigGameDefault:0;}
  function defaultRegGames(key,rb){const m=MACHINES[key];return m&&m.regGameDefault?Math.max(0,nnum(rb))*m.regGameDefault:0;}

  return{VERSION,MACHINES,STYLE_LABEL,numericJudge,liveJudge,reverseBell,machineConfig,defaultBigGames,defaultRegGames,_internals:{normalizeLogs,logBonus,logBinom,logCategoricalCounts,metrics}};
});
