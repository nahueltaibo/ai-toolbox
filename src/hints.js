import pc from "picocolors";

// Centralizes the "what to do next" messages so the wording stays consistent
// wherever a command needs to nudge a user toward the next step.

export function printNoRegistriesHint() {
  console.error(pc.yellow("No registries configured yet."));
  console.error(pc.yellow("  Try this repo's own tools: ai-toolbox registry add nahueltaibo nahueltaibo/ai-toolbox"));
  console.error(pc.yellow("  Or add your own:           ai-toolbox registry add <name> <owner/repo[@branch]|path>"));
}

// exampleId, when known (the registry just added has at least one tool), makes the
// hint copy-pasteable instead of a <placeholder> the user has to fill in themselves.
export function printNextStepsHint(exampleId) {
  const id = exampleId ?? "<id>";
  console.log(pc.dim("Next:"));
  console.log(pc.dim("  ai-toolbox list             # see what's available"));
  console.log(pc.dim(`  ai-toolbox view ${id}    # check a tool before installing`));
  console.log(pc.dim(`  ai-toolbox install ${id} # install one`));
}
