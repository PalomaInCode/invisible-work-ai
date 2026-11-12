/** Invisible Work AI — deterministic analytics. No LLM is used to calculate metrics. */
export function parseCSV(text) {
  const rows = [];
  let cells = [], cell = '', quoted = false;
  const src = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"') {
      if (quoted && src[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) { cells.push(cell); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      cells.push(cell); if (cells.some(v => v.trim())) rows.push(cells);
      cells = []; cell = '';
    } else cell += ch;
  }
  if (quoted) throw new Error('CSV inválido: aspas não fechadas.');
  cells.push(cell); if (cells.some(v => v.trim())) rows.push(cells);
  if (!rows.length) return [];
  const header = rows[0].map(s => s.trim().toLowerCase());
  if (new Set(header).size !== header.length) throw new Error('O CSV contém nomes de colunas duplicados.');
  return rows.slice(1).map((row, i) => {
    const obj = {}; header.forEach((name, j) => obj[name] = (row[j] ?? '').trim());
    obj.__line = i + 2; return obj;
  });
}

const REQUIRED = ['case_id', 'processo', 'atividade', 'data', 'duracao_min', 'retrabalho', 'execucao'];
export function normalizeActivities(raw) {
  if (!raw.length) throw new Error('O arquivo não contém registros.');
  const missing = REQUIRED.filter(k => !(k in raw[0]));
  if (missing.length) throw new Error(`Colunas ausentes: ${missing.join(', ')}. Consulte o arquivo de exemplo.`);
  const clean = [], issues = [];
  for (const row of raw) {
    const minutes = Number(String(row.duracao_min).replace(',', '.'));
    const dt = new Date(row.data);
    if (!row.case_id || !row.processo || !row.atividade || !Number.isFinite(minutes) || minutes < 0 || minutes > 1440 || Number.isNaN(dt.getTime())) {
      issues.push(`Linha ${row.__line}: identificador, processo, atividade, duração ou data inválidos.`); continue;
    }
    clean.push({
      id: row.case_id,
      processo: row.processo,
      atividade: row.atividade,
      date: row.data,
      minutes,
      rework: /^(sim|s|yes|true|1)$/i.test(row.retrabalho),
      manual: !/^(auto|automatico|automático|automated)$/i.test(row.execucao),
      status: row.status || 'Concluído'
    });
  }
  if (!clean.length) throw new Error('Nenhuma linha válida encontrada.');
  return { rows: clean, issues };
}

const round = (n, digits=1) => Number(n.toFixed(digits));
export function analyzeActivities(rows) {
  const totalMinutes = rows.reduce((s,r) => s + r.minutes, 0);
  const reworkCount = rows.filter(r => r.rework).length;
  const manualCount = rows.filter(r => r.manual).length;
  const grouped = new Map();
  for (const r of rows) {
    const key = `${r.processo}|||${r.atividade}`;
    const item = grouped.get(key) || {processo:r.processo, atividade:r.atividade, count:0,minutes:0,rework:0,manual:0};
    item.count++; item.minutes+=r.minutes;
    item.rework+=Number(r.rework); item.manual+=Number(r.manual);
    grouped.set(key,item);
  }
  const activities = [...grouped.values()].map(x => {
    const avg = x.minutes / x.count;
    // Opportunity score is a transparent heuristic (0-100), NOT an ML prediction.
    const score = Math.min(100, Math.round(
      25 * Math.min(1, x.count / 45) +
      30 * Math.min(1, x.minutes / 600) +
      20 * x.rework / x.count +
      25 * x.manual / x.count
    ));
    const automationPotential = x.manual / x.count >= 0.7 ? 0.55 : 0.25;
    return {...x, avg:round(avg), score, reworkRate:round(100*x.rework/x.count),
      potentialMinutes:round(x.minutes*automationPotential),
      assumption: x.manual / x.count >= 0.7 ? 55 : 25
    };
  }).sort((a,b) => b.score-a.score || b.minutes-a.minutes);
  const process = new Map();
  for (const row of rows) {
    const value = process.get(row.processo) || {name:row.processo,minutes:0,count:0,rework:0};
    value.minutes += row.minutes; value.count++; value.rework+=Number(row.rework);
    process.set(row.processo,value);
  }
  const processes = [...process.values()].sort((a,b) => b.minutes-a.minutes).map(p=>({...p,hours:round(p.minutes/60)}));
  return {
    kpis: {events:rows.length,hours:round(totalMinutes/60), reworkRate:round(100*reworkCount/rows.length),manualRate:round(100*manualCount/rows.length), opportunities:activities.filter(x=>x.score>=55).length},
    activities,processes,
    projectedHours:round(activities.filter(x=>x.score>=55).reduce((s,x)=>s+x.potentialMinutes,0)/60),
    method:'Score heurístico: 25% frequência, 30% tempo acumulado, 20% retrabalho, 25% execução manual. Economia apenas estimada.'
  };
}

export function reconcileOrders(orderCSV, paymentCSV) {
  const orders = parseCSV(orderCSV), payments = parseCSV(paymentCSV);
  if (!orders.length || !payments.length) throw new Error('Pedidos e pagamentos devem conter registros.');
  for (const k of ['pedido_id','valor_pedido']) if (!(k in orders[0])) throw new Error(`Coluna ${k} ausente em pedidos.`);
  for (const k of ['pedido_id','valor_pago']) if (!(k in payments[0])) throw new Error(`Coluna ${k} ausente em pagamentos.`);
  const normalizeAmount = v => Number(String(v).replace(',', '.'));
  const paymentMap = new Map();
  for (const p of payments) {
    const id=p.pedido_id;
    if (!paymentMap.has(id)) paymentMap.set(id,[]);
    paymentMap.get(id).push(p);
  }
  const results=[];
  const seenOrders=new Set();
  for (const order of orders) {
    const id=order.pedido_id, matches=paymentMap.get(id)||[];
    const expected=normalizeAmount(order.valor_pedido);
    const paid=matches.length === 1 ? normalizeAmount(matches[0].valor_pago) : null;
    let status='conciliado', detail='Valores correspondem';
    if (seenOrders.has(id)) {status='excecao';detail='Pedido duplicado';}
    else if (!Number.isFinite(expected)) {status='excecao';detail='Valor do pedido inválido';}
    else if (!matches.length) {status='excecao';detail='Pagamento não encontrado';}
    else if (matches.length>1) {status='excecao';detail='Pagamento duplicado';}
    else if (!Number.isFinite(paid)) {status='excecao';detail='Valor do pagamento inválido';}
    else if (Math.abs(expected-paid)>0.009) {status='excecao';detail='Divergência de valor';}
    seenOrders.add(id);
    results.push({id,expected,paid,status,detail});
  }
  for (const [id, list] of paymentMap) {
    if (!seenOrders.has(id)) results.push({id,expected:null,paid:list.length===1?normalizeAmount(list[0].valor_pago):null,status:'excecao',detail:'Pagamento sem pedido'});
  }
  return {results,ok:results.filter(x=>x.status==='conciliado').length,exceptions:results.filter(x=>x.status==='excecao').length};
}

export function csvExport(results) {
  const columns=['pedido_id','valor_pedido','valor_pago','status','observacao'];
  const enc = v => '"'+String(v??'').replaceAll('"','""')+'"';
  return [columns.join(','),...results.map(r=>[r.id,r.expected,r.paid,r.status,r.detail].map(enc).join(','))].join('\r\n');
}
