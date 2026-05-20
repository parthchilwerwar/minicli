import cron from 'node-cron';
import { loadRoutines, updateRoutine, loadContext, saveNote } from './memory.js';
import { runAgent } from './agent.js';
import { ALL_TOOLS } from './tools/registry.js';
import { info, error } from './ui.js';

export async function runHeadlessRoutine(id: string): Promise<void> {
  const routines = loadRoutines();
  const routine = routines.find(r => r.id === id);
  if (!routine) return;

  const ctx = loadContext();
  let ctxBlock = '';
  if (Object.keys(ctx).length > 0) {
    ctxBlock = `Personal Context Profile:\n${JSON.stringify(ctx, null, 2)}\n`;
  }
  
  const systemMsg = `${ctxBlock}Execute the following automation routine. Summarize what you did clearly in a note.`;
  
  try {
     const result = await runAgent(
         routine.desc, 
         ALL_TOOLS, 
         [{ role: 'system', content: systemMsg }], 
         false // Headless so stream=false
     );
     
     saveNote(`[Routine: ${routine.desc}]\n${result}`, ['routine', 'automated']);
     
     routine.lastRun = Date.now();
     updateRoutine(routine);
  } catch (err: unknown) {
     error("Routine failed: " + (err instanceof Error ? err.message : String(err)));
  }
}

export function startScheduler(): void {
   const routines = loadRoutines();
   let count = 0;
   
   for (const r of routines) {
     if (r.cronExpr && !r.once) {
        try {
          cron.schedule(r.cronExpr, () => {
             void runHeadlessRoutine(r.id);
          });
          count++;
        } catch {
          error(`Failed to schedule routine ${r.id} with cron ${r.cronExpr}`);
        }
     }
   }
   
   if (count > 0) {
     info(`Scheduler started with ${count} active cron routines.`);
   }
}
