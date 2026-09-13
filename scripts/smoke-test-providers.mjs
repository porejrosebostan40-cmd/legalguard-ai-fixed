const deepSeekKey = process.env.DEEPSEEK_API_KEY;
const openAiKey = process.env.OPENAI_API_KEY;

if (!deepSeekKey) throw new Error('DEEPSEEK_API_KEY: секрет не передан в GitHub Actions');
if (!openAiKey) throw new Error('OPENAI_API_KEY: секрет не передан в GitHub Actions');

async function chat({ url, key, model, system, user }) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      stream: false,
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  let json;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error('Провайдер вернул невалидный JSON HTTP-ответ.');
  }

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Провайдер не вернул содержимое ответа модели.');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Модель вернула невалидный JSON в message.content.');
  }

  return { model: json.model, parsed };
}

const syntheticMaterial = `Судебный акт: суд отказал в удовлетворении ходатайства осужденного.\n\nФрагмент: в мотивировке указано, что осужденный не признал вину. При этом в протоколе судебного заседания и в письменных возражениях защиты указано, что осужденный вину признал.\n\nДополнительный фрагмент: суд также сослался на отсутствие положительной характеристики, хотя в материалах имеется положительная характеристика администрации учреждения.`;

console.log('ПРОВЕРКА 1: DeepSeek — реальный аналитический запрос');
const deepSeek = await chat({
  url: 'https://api.deepseek.com/chat/completions',
  key: deepSeekKey,
  model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro',
  system: 'Ты первичный юридический аналитик. Верни только JSON. Найди потенциально значимые для жалобы противоречия и процессуальные дефекты только из данного материала. Не придумывай факты или нормы. Формат JSON: {"findings":[{"id":"string","claim":"string","sourceQuote":"string","confidence":0}]}',
  user: syntheticMaterial,
});

if (!Array.isArray(deepSeek.parsed.findings) || deepSeek.parsed.findings.length === 0) {
  throw new Error('DeepSeek smoke-test: модель не вернула findings.');
}
console.log(`DeepSeek: РАБОТАЕТ, модель ${deepSeek.model}, findings=${deepSeek.parsed.findings.length}`);

console.log('ПРОВЕРКА 2: ChatGPT — реальный запрос Арбитра');
const arbiter = await chat({
  url: 'https://api.openai.com/v1/chat/completions',
  key: openAiKey,
  model: process.env.OPENAI_MODEL || 'gpt-5.6-sol',
  system: 'Ты Арбитр LegalGuard. Верни только JSON. Проверяй фактическую опору вывода, применимость и юридическую значимость. Разрешены статусы accepted, rejected, needs_review. Не придумывай факты или нормы. Формат JSON: {"decisions":[{"id":"F1","status":"accepted|rejected|needs_review","legalSignificance":"high|medium|low|none","reasoning":"string"},{"id":"F2","status":"accepted|rejected|needs_review","legalSignificance":"high|medium|low|none","reasoning":"string"}]}',
  user: `${syntheticMaterial}\n\nПроверь два вывода:\nF1: Суд указал, что осужденный не признал вину, хотя предоставленный материал прямо говорит об обратном.\nF2: Суд отказал потому, что сегодня понедельник, и это само по себе является достаточным юридическим основанием для отказа.`,
});

const decisions = arbiter.parsed.decisions;
if (!Array.isArray(decisions) || decisions.length < 2) {
  throw new Error('ChatGPT smoke-test: модель не вернула два решения Арбитра.');
}
const f1 = decisions.find((item) => item.id === 'F1');
const f2 = decisions.find((item) => item.id === 'F2');
if (!f1 || !f2) throw new Error('ChatGPT smoke-test: отсутствует F1 или F2.');
if (f1.status !== 'accepted') throw new Error(`ChatGPT smoke-test: F1 должен быть accepted, получено ${f1.status}.`);
if (f2.status !== 'rejected') throw new Error(`ChatGPT smoke-test: F2 должен быть rejected, получено ${f2.status}.`);
console.log(`ChatGPT: РАБОТАЕТ, модель ${arbiter.model}, F1=${f1.status}, F2=${f2.status}`);

console.log('ПРОВЕРКА 3: сквозная связка DeepSeek → ChatGPT Арбитр');
const linked = await chat({
  url: 'https://api.openai.com/v1/chat/completions',
  key: openAiKey,
  model: process.env.OPENAI_MODEL || 'gpt-5.6-sol',
  system: 'Ты Арбитр LegalGuard. Верни только JSON. Для каждого полученного finding укажи id и status. Принимай только выводы, которые прямо подтверждаются материалом. Формат JSON: {"decisions":[{"id":"string","status":"accepted|rejected|needs_review"}]}',
  user: JSON.stringify({ material: syntheticMaterial, findings: deepSeek.parsed.findings }),
});

if (!Array.isArray(linked.parsed.decisions) || linked.parsed.decisions.length === 0) {
  throw new Error('Сквозной тест: ChatGPT не обработал findings DeepSeek.');
}
const knownIds = new Set(deepSeek.parsed.findings.map((item) => item.id));
for (const decision of linked.parsed.decisions) {
  if (!knownIds.has(decision.id)) {
    throw new Error(`Сквозной тест: ChatGPT создал неизвестный finding ${decision.id}.`);
  }
}
console.log(`Сквозной тест: РАБОТАЕТ, передано findings=${deepSeek.parsed.findings.length}, решений=${linked.parsed.decisions.length}`);
console.log('ИТОГ: DEEPSEEK + CHATGPT + СКВОЗНАЯ ПРОВЕРКА — УСПЕШНО');
