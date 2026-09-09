#!/usr/bin/env node
import { buildProgram } from "../src/cli.js";

buildProgram()
  .parseAsync(process.argv)
  .catch((error) => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
