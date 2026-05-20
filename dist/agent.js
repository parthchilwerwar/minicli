import { callLLM } from './llm.js';
import { toSchema } from './tools/registry.js';
import { toolStart, toolDone, error, confirmPrompt, info } from './ui.js';
import { quickLLM } from './llm.js';
const MAX_STEPS = 10;
export async function runAgent(userMessage, tools, history, stream = true) {
    const messages = [...history, { role: 'user', content: userMessage }];
    const toolSchemas = tools.map(toSchema);
    let steps = 0;
    while (steps < MAX_STEPS) {
        if (steps > 0 && stream)
            process.stdout.write('  '); // Indent continued responses after a spinner
        const response = await callLLM(messages, toolSchemas, undefined, stream);
        if (!response.tool_calls || response.tool_calls.length === 0) {
            return response.content;
        }
        messages.push({ role: 'assistant', tool_calls: response.tool_calls });
        for (const toolCall of response.tool_calls) {
            const tool = tools.find((t) => t.name === toolCall.function.name);
            if (!tool) {
                const msg = `unknown tool: ${toolCall.function.name}`;
                error(msg);
                messages.push({ role: 'tool', tool_call_id: toolCall.id, content: `ERROR: ${msg}` });
                continue;
            }
            toolStart(tool.name);
            let args;
            try {
                args = JSON.parse(toolCall.function.arguments);
            }
            catch {
                args = {};
            }
            const result = await tool.execute(args);
            toolDone(result);
            messages.push({ role: 'tool', tool_call_id: toolCall.id, content: result });
        }
        steps++;
    }
    return 'max steps reached.';
}
export async function runSupervisedPlan(task, tools) {
    info('Generating step-by-step plan...');
    const prompt = `Create a step-by-step plan for the following task using the available tools. Only output a numbered list of steps, one per line. No markdown formatting, just the steps.\nTask: ${task}`;
    const planTxt = await quickLLM(prompt);
    const steps = planTxt.split('\n').filter((s) => /^\d+\./.test(s.trim()));
    if (steps.length === 0) {
        info('Could not parse plan. The agent provided: \n' + planTxt);
        return;
    }
    info(`\nProposed Plan:\n${steps.join('\n')}\n`);
    for (const step of steps) {
        const ok = await confirmPrompt(`Execute step: ${step}?`);
        if (!ok) {
            info(`Skipping step: ${step}`);
            continue;
        }
        await runAgent(`Execute this step from my plan: ${step}`, tools, [], false);
    }
    info('Plan execution complete.');
}
//# sourceMappingURL=agent.js.map