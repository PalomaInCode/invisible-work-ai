const make = (analysis, question = '') => {
  const top = analysis.activities.slice(0, 3);
  const lines = [
    `Foram analisados ${analysis.kpis.events} eventos, totalizando ${analysis.kpis.hours.toLocaleString('pt-BR')} horas registradas.`,
    `O índice de retrabalho nos registros é ${analysis.kpis.reworkRate.toLocaleString('pt-BR')}%.`,
    ...top.map((a, i) => `${i + 1}. ${a.atividade} (${a.processo}): ${a.count} ocorrências, ${(a.minutes / 60).toFixed(1).replace('.', ',')} horas e ${a.reworkRate}% de retrabalho.`)
  ];
  return {
    mode: 'rules',
    headline: 'Oportunidades encontradas nos seus dados',
    summary: lines.join('\n'),
    recommendation: top.length ? `Comece analisando “${top[0].atividade}”: o processo tem score heurístico ${top[0].score}/100. Valide as regras e execute um piloto supervisionado antes de automatizar.` : 'Importe registros para iniciar a análise.',
    disclaimer: 'Análise determinística baseada nos dados importados. Não utiliza modelo generativo. Economia projetada não é economia comprovada.',
    question: question.slice(0, 300)
  };
};

export async function generateInsight(analysis, question = '') {
  const fallback = make(analysis, question);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return fallback;
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const limited = {
    kpis: analysis.kpis,
    topActivities: analysis.activities.slice(0, 8).map(a => ({processo:a.processo,atividade:a.atividade,ocorrencias:a.count,horas:Number((a.minutes/60).toFixed(1)),retrabalho_percentual:a.reworkRate,score_heuristico:a.score})),
    metodologia:analysis.method
  };
  const system = `Você é uma analista de processos empresariais. Responda em português, de forma objetiva, usando SOMENTE as métricas no JSON a seguir. NÃO invente valores, nomes de empresas, reduções de tempo ou cálculos. Diga explicitamente que o score é heurístico, e que economia é projeção e não resultado real. Responda sem markdown com 2 parágrafos: diagnóstico e ação sugerida. JSON: ${JSON.stringify(limited)}. Pergunta: ${String(question).slice(0,600)}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response;
    try { response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method:'POST', headers:{'Content-Type':'application/json','x-goog-api-key':key},
      body: JSON.stringify({contents:[{parts:[{text:system}]}],generationConfig:{temperature:0.2,maxOutputTokens:500}}),signal:controller.signal
    }); } finally {clearTimeout(timeout);}
    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
    const json = await response.json();
    const content = json?.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('\n').trim();
    if (!content) throw new Error('Modelo não retornou conteúdo');
    return {mode:'gemini', headline:'Análise gerada com Gemini',summary:content,recommendation:fallback.recommendation,disclaimer:'Texto gerado por modelo de IA. Indicadores calculados deterministicamente; valide recomendações antes de executar.',question:question.slice(0,300)};
  } catch(err) {
    return {...fallback,disclaimer:`Gemini indisponível; análise por regras ativada. ${fallback.disclaimer}`};
  }
}
