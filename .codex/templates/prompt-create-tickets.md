# Create tickets from an epic
Use the epic-to-ticket workflow and readiness gates in [AGENTS.md](../../AGENTS.md#product-planning-workflow) for EL-EP-{NNN}, including baseline verification and the conditional UI handoff. Then use `ticket_writer` only for work whose applicable gates pass. Create implementable tickets using the project format and Dado/Cuando/Entonces. Record order/dependencies and update BACKLOG.md + DEPENDENCIES.md. Then use `requirements_reviewer` on the generated tickets.

Use `.codex/product/CONVENTIONS.md` for canonical IDs; preserve existing numbers and never reuse historical IDs.
