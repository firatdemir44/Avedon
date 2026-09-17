// ANTHROPIC_MOCK=1: model yerine deterministik tur. Uçtan uca testler sohbet
// kaydını, araç kartlarını ve hafıza önerisini bununla sınar.
//   "/araçAdı {json}"  → o aracı verilen girdiyle çalıştırır ve özetini yazar
//   "hafıza: key=value" → hafiza_oner aracını çağırır
//   diğer                → metni yankılar
import { runRunnableTool } from '@anthropic-ai/sdk/lib/tools/BetaRunnableTool';
import type { ToolSet } from './tools';

const MOCK_PREFIX = 'Sahte asistan (ANTHROPIC_MOCK=1): ';

async function callTool(toolSet: ToolSet, name: string, input: unknown) {
  const tool = toolSet.tools.find((t) => t.name === name);
  if (!tool) return `Böyle bir araç yok: ${name}`;
  const outcome = await runRunnableTool(tool, input, { toolUse: { type: 'tool_use', id: 'mock', name, input: input as Record<string, unknown> }, toolUseBlock: { type: 'tool_use', id: 'mock', name, input: input as Record<string, unknown> } });
  return typeof outcome.content === 'string' ? outcome.content : JSON.stringify(outcome.content);
}

export async function mockAssistantTurn(text: string, toolSet: ToolSet): Promise<{ text: string }> {
  const skill = text.match(/^\/(\w+)\s+(\{[\s\S]*\})\s*$/);
  if (skill) {
    let input: unknown;
    try {
      input = JSON.parse(skill[2]);
    } catch {
      return { text: `${MOCK_PREFIX}girdi JSON değil.` };
    }
    const raw = await callTool(toolSet, skill[1], input);
    const last = toolSet.calls[toolSet.calls.length - 1];
    return { text: `${MOCK_PREFIX}${last ? `Hesapladım. ${last.summary}` : raw}` };
  }

  const mem = text.match(/^hafıza:\s*(\w+)\s*=\s*(.+)$/i);
  if (mem) {
    const num = Number(mem[2].replace(',', '.'));
    await callTool(toolSet, 'hafiza_oner', { key: mem[1], value: Number.isFinite(num) ? num : mem[2].trim(), reason: 'Sahte asistan önerisi' });
    return { text: `${MOCK_PREFIX}${mem[1]} değerini hafızaya kaydetmeyi öneriyorum.` };
  }

  const watch = text.match(/^izle:\s*(\{[\s\S]*\})\s*$/i);
  if (watch) {
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(watch[1]);
    } catch {
      return { text: `${MOCK_PREFIX}girdi JSON değil.` };
    }
    await callTool(toolSet, 'izleme_oner', { ...input, reason: 'Sahte asistan önerisi' });
    return { text: `${MOCK_PREFIX}izleme kuralı öneriyorum.` };
  }

  return { text: `${MOCK_PREFIX}"${text}" dedin.` };
}
