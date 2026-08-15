// Generates the value for AUTH_PASSWORD_HASH (AUTH_MODE=password — see
// README "Auth"). The login password is never configured as plaintext; this
// is the one supported way to turn a chosen password into the scrypt hash
// config.ts and auth/passwordHash.ts expect.
//
// Usage:
//   npm run hash-password
//     Prompts for the password on stdin (not echoed if stdin is a TTY),
//     prints AUTH_PASSWORD_HASH=... to stdout. Paste that line into .env.
//
//   npm run hash-password -- "correct horse battery staple"
//     Same, but the password is a CLI argument instead of a prompt — only
//     use this on a machine where you don't mind it briefly appearing in
//     shell history / `ps`; the interactive prompt above avoids both.

import { createInterface } from "node:readline";
import { hashPassword } from "../src/auth/passwordHash.js";

function promptPassword(question: string): Promise<string> {
  return new Promise((resolve) => {
    const input = process.stdin;
    const output = process.stdout;
    const rl = createInterface({ input, output, terminal: input.isTTY === true });

    if (input.isTTY) {
      // Mask keystrokes: readline's own output writer is swapped for one
      // that only ever emits the prompt itself and the trailing newline —
      // the standard technique Node CLIs use for a password prompt without
      // pulling in a dependency for it.
      const rlAny = rl as unknown as { _writeToOutput: (s: string) => void };
      const realWrite = rlAny._writeToOutput.bind(rlAny);
      let echo = true;
      rlAny._writeToOutput = (str: string) => {
        if (echo || str === "\n" || str === "\r\n") realWrite(str);
      };
      output.write(question);
      echo = false;
      rl.question("", (answer) => {
        echo = true;
        output.write("\n");
        rl.close();
        resolve(answer);
      });
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

async function main(): Promise<void> {
  const fromArg = process.argv[2];
  const password = fromArg ?? (await promptPassword("Password: "));

  if (!password) {
    console.error("No password given.");
    process.exitCode = 1;
    return;
  }

  console.log(`AUTH_PASSWORD_HASH=${hashPassword(password)}`);
}

void main();
