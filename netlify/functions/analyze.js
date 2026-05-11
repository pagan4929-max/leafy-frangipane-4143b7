exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { ticker, assetType, exchange, lang } = JSON.parse(event.body);
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500, headers,
        body: JSON.stringify({ error: 'API key no configurada en Netlify. Ve a Site Settings → Environment Variables y agrega ANTHROPIC_API_KEY.' })
      };
    }

    const langInstr = lang === 'es'
      ? 'Responde completamente en español. Términos técnicos en inglés entre paréntesis cuando sea necesario. Todos los valores de string deben ser una sola línea sin saltos de línea internos.'
      : 'Respond completely in English. All string values must be single-line with no internal newlines.';

    const sysprompt = `Eres un analista financiero de élite especializado en mercados bursátiles globales. ${langInstr}
Retorna ÚNICAMENTE el objeto JSON sin texto antes ni después, sin bloques de código, sin backticks. Estructura exacta:
{"ticker":"","nombre":"","tipo":"","resumen_ejecutivo":"","tecnico":{"tendencia":"ALCISTA|BAJISTA|LATERAL","fuerza_tendencia":"FUERTE|MODERADA|DÉBIL","soportes":["",""],"resistencias":["",""],"indicadores":{"rsi":"","macd":"","medias_moviles":"","volumen":""},"patrones":"","analisis_detallado":""},"fundamental":{"valoracion":"SOBREVALORADO|INFRAVALORADO|JUSTO VALOR","metricas_clave":"","catalistas":"","analisis_detallado":""},"sentimiento":{"mercado":"POSITIVO|NEGATIVO|NEUTRAL","institucional":"","minorista":"","noticias":"","fear_greed":"","analisis_detallado":""},"riesgo":{"nivel":"ALTO|MEDIO|BAJO","volatilidad":"","beta":"","escenario_alcista":"","escenario_bajista":"","stop_loss_sugerido":"","analisis_detallado":""},"senales":{"primaria":"COMPRA|VENTA|MANTENER","confianza":"ALTA|MEDIA|BAJA","zona_entrada":"","objetivo_precio":"","timeframe":"","razon":"","senales_especificas":[{"tipo":"COMPRA|VENTA|MANTENER","descripcion":"","condicion":""}]},"consideraciones_especiales":""}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1500,
        system: sysprompt,
        messages: [{ role: 'user', content: `Analiza: ${ticker} (Tipo: ${assetType}, Exchange: ${exchange}). Referencia: Mayo 2026.` }]
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { statusCode: res.status, headers, body: JSON.stringify({ error: err?.error?.message || res.statusText }) };
    }

    const data = await res.json();
    const txt = data.content?.find(b => b.type === 'text')?.text || '';

    // Robust JSON extraction
    let clean = txt.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'")
      .replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const js = clean.indexOf('{'), je = clean.lastIndexOf('}');
    if (js === -1 || je === -1) throw new Error('No JSON in response: ' + txt.slice(0, 200));
    let jsonStr = clean.slice(js, je + 1);

    let parsed;
    try { parsed = JSON.parse(jsonStr); }
    catch {
      jsonStr = jsonStr.replace(/:\s*"((?:[^"\\]|\\.)*)"/g, (_, v) => `:"${v.replace(/\n/g, ' ').replace(/\r/g, '').replace(/\t/g, ' ')}"`);
      parsed = JSON.parse(jsonStr);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ result: parsed }) };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
