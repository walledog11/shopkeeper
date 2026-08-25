type AppSurface = 'dashboard' | 'gateway';

function readAppArg(): AppSurface {
  const raw = process.argv.find((arg) => arg.startsWith('--app='))?.slice('--app='.length).trim();
  if (raw === 'dashboard' || raw === 'gateway') {
    return raw;
  }
  throw new Error(
    'Usage: npx tsx scripts/emit-controlled-ops-alert.ts --app=dashboard|gateway <category> [test-org-id]',
  );
}

function remainingArgv(): string[] {
  return process.argv.slice(2).filter((arg) => !arg.startsWith('--app='));
}

async function main(): Promise<void> {
  const app = readAppArg();
  const argv = remainingArgv();

  if (app === 'dashboard') {
    const { runDashboardEmitControlledOpsAlert } = await import('./emit-controlled-ops-alert/dashboard.js');
    await runDashboardEmitControlledOpsAlert(argv);
    return;
  }

  const { runGatewayEmitControlledOpsAlert } = await import('./emit-controlled-ops-alert/gateway.js');
  await runGatewayEmitControlledOpsAlert(argv);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
