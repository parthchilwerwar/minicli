import cron from 'node-cron';
import { loadRoutines, updateRoutine, loadContext, saveNote } from './memory.js';
import { runAgent } from './agent.js';
import { ALL_TOOLS } from './tools/registry.js';
import { info, error } from './ui.js';
/** Tools that need an interactive TTY or are too destructive for cron. */
const HEADLESS_BLOCKLIST = new Set(['run_shell', 'write_file']);
/**
 * Routines run from cron with no TTY, so any tool that calls inquirer or
 * writes outside the allow-list would deadlock or do damage. We filter
 * ALL_TOOLS down to the safe subset for headless execution.
 */
function headlessTools() {
    return ALL_TOOLS.filter((t) => !HEADLESS_BLOCKLIST.has(t.name));
}
export async function runHeadlessRoutine(id) {
    const routines = loadRoutines();
    const routine = routines.find(r => r.id === id);
    if (!routine)
        return;
    const ctx = loadContext();
    let ctxBlock = '';
    if (Object.keys(ctx).length > 0) {
        ctxBlock = `Personal Context Profile:\n${JSON.stringify(ctx, null, 2)}\n`;
    }
    const systemMsg = `${ctxBlock}Execute the following automation routine. Summarize what you did clearly in a note. Note: shell execution and arbitrary file writes are disabled in headless cron mode.`;
    try {
        const result = await runAgent(routine.desc, headlessTools(), [{ role: 'system', content: systemMsg }], false // Headless so stream=false
        );
        saveNote(`[Routine: ${routine.desc}]\n${result}`, ['routine', 'automated']);
        routine.lastRun = Date.now();
        updateRoutine(routine);
    }
    catch (err) {
        error("Routine failed: " + (err instanceof Error ? err.message : String(err)));
    }
}
export function startScheduler() {
    const routines = loadRoutines();
    let count = 0;
    for (const r of routines) {
        if (r.cronExpr && !r.once) {
            try {
                cron.schedule(r.cronExpr, () => {
                    void runHeadlessRoutine(r.id);
                });
                count++;
            }
            catch {
                error(`Failed to schedule routine ${r.id} with cron ${r.cronExpr}`);
            }
        }
    }
    if (count > 0) {
        info(`Scheduler started with ${count} active cron routines.`);
    }
}
//# sourceMappingURL=routine.js.map