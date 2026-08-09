/**
 * KARA OS-level builtins.
 *
 * The interpreter itself stays pure (no I/O) so it can run in the browser
 * playground; the desktop runtime attaches these to the program via
 * `program.extraBuiltins`. The compiler accepts the calls in both contexts —
 * in the browser the interpreter reports them as unavailable.
 */

import fs from 'node:fs';

export const OS_BUILTINS = {
  'File.Read': (args) => {
    const [p] = args;
    return fs.readFileSync(String(p), 'utf8');
  },
  'File.Write': (args) => {
    const [p, data] = args;
    fs.writeFileSync(String(p), String(data ?? ''), 'utf8');
    return null;
  },
};
