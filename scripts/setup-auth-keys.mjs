#!/usr/bin/env node
/**
 * Generate the signing key pair that Convex Auth needs and install it on a
 * deployment.
 *
 * Convex Auth signs its session tokens with an RS256 private key
 * (`JWT_PRIVATE_KEY`) and publishes the matching public key as a JWKS
 * document (`JWKS`). Both live in the *deployment's* environment, not in the
 * Next.js app's `.env.local`.
 *
 * The values are never printed and never written to a file that is tracked by
 * git. They are handed to the Convex CLI through a temporary file, so they do
 * not end up in the shell history either.
 *
 * Usage:
 *   node scripts/setup-auth-keys.mjs                # configure the dev deployment
 *   node scripts/setup-auth-keys.mjs --prod         # configure the production deployment
 *   node scripts/setup-auth-keys.mjs --out keys.env # write the keys to a file instead
 *
 * Run `npx convex login` first: the CLI needs to be authenticated before it
 * can talk to a deployment.
 */

import { execFileSync } from "node:child_process";
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

const PROJECT_ROOT = resolve(new URL("..", import.meta.url).pathname);

/** Parse `--flag value` and `--flag` style arguments. */
function parseArgs(argv) {
  const options = {
    deployment: undefined,
    url: undefined,
    prod: false,
    out: undefined,
    force: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--deployment":
        options.deployment = argv[++i];
        break;
      case "--url":
        options.url = argv[++i];
        break;
      case "--prod":
        options.prod = true;
        break;
      case "--out":
        options.out = argv[++i];
        break;
      case "--force":
        options.force = true;
        break;
      case "-h":
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/setup-auth-keys.mjs [options]

Options:
  --deployment <name>  The deployment to configure (default: the dev deployment)
  --url <url>         The deployment URL (use for a self-hosted deployment)
  --prod              Configure the production deployment
  --out <file>        Write the keys to a file instead of the deployment
  --force             Overwrite keys that are already set on the deployment
  -h, --help          Show this message

The private key never leaves this machine except through the Convex CLI.`);
}

/**
 * Generate the RS256 key pair in the shape Convex Auth expects.
 *
 * `JWT_PRIVATE_KEY` is a PKCS#8 PEM with the line breaks turned into spaces,
 * which is exactly what the official `@convex-dev/auth` CLI produces.
 */
function generateKeys() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "jwk" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });

  return {
    JWT_PRIVATE_KEY: `${privateKey.trimEnd().replace(/\n/g, " ")}`,
    JWKS: jwks,
  };
}

/**
 * Check that the generated pair actually works together.
 *
 * Signs a random message with the private key and verifies it with the public
 * key taken from the JWKS, so a broken pair is caught here rather than at
 * sign-in time.
 */
function selfCheck(keys) {
  const privateKey = createPrivateKey(toPem(keys.JWT_PRIVATE_KEY));
  const publicJwk = JSON.parse(keys.JWKS).keys[0];
  const publicKey = createPublicKey({ key: publicJwk, format: "jwk" });

  const message = Buffer.from("northed-auth-self-check");
  const signature = sign("sha256", message, privateKey);
  if (!verify("sha256", message, publicKey, signature)) {
    throw new Error("The generated key pair failed its self check.");
  }
}

/**
 * Turn the single line private key back into a PEM that Node can parse.
 *
 * `JWT_PRIVATE_KEY` is stored with the line breaks replaced by spaces, which
 * is what the Convex Auth CLI writes. The library parses it by stripping all
 * whitespace before decoding, so the self check does the same rather than
 * handing the single line form to Node's stricter PEM parser.
 */
function toPem(singleLine) {
  const body = singleLine
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;
}

/**
 * Turn a deployment reference into the bare name `--deployment` expects.
 *
 * Accepts `dev:my-deployment`, `my-deployment` and the full
 * `dev:my-deployment # team: ..., project: ...` form that the CLI writes
 * into `.env.local`, and returns `my-deployment` in every case.
 */
function normalizeDeployment(value) {
  return value
    .split("#")[0]
    .trim()
    .replace(/^[^:]*:/, "")
    .trim();
}

function convexCli(args) {
  return execFileSync("npx", ["convex", ...args], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
  });
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    printHelp();
    process.exit(1);
    return;
  }

  if (options.help) {
    printHelp();
    return;
  }

  const keys = generateKeys();
  selfCheck(keys);

  if (options.out !== undefined) {
    const target = resolve(PROJECT_ROOT, options.out);
    writeFileSync(target, `JWT_PRIVATE_KEY=${keys.JWT_PRIVATE_KEY}\nJWKS=${keys.JWKS}\n`, {
      mode: 0o600,
    });
    console.log(`Wrote the key pair to ${target}.`);
    console.log("Keep this file out of git and delete it once the keys are set.");
    return;
  }

  // Deployment selection.
  //
  // With no flag at all the Convex CLI resolves the dev deployment from
  // `CONVEX_DEPLOYMENT` in `.env.local` on its own, which is exactly what we
  // want. Passing the raw value through does not work: the file holds
  // `dev:<name> # team: ..., project: ...`, and neither the `dev:` prefix nor
  // the trailing comment is accepted by `--deployment`.
  const deploymentOptions = [];
  if (options.url !== undefined) {
    deploymentOptions.push("--url", options.url);
  } else if (options.prod) {
    deploymentOptions.push("--prod");
  } else if (options.deployment !== undefined) {
    deploymentOptions.push("--deployment", normalizeDeployment(options.deployment));
  }

  const directory = mkdtempSync(join(tmpdir(), "northed-auth-"));
  const file = join(directory, "auth-keys.env");

  try {
    writeFileSync(file, `JWT_PRIVATE_KEY=${keys.JWT_PRIVATE_KEY}\nJWKS=${keys.JWKS}\n`, {
      mode: 0o600,
    });

    const args = ["env", "set", "--from-file", file];
    if (options.force) {
      args.push("--force");
    }
    args.push(...deploymentOptions);

    convexCli(args);
    console.log("Convex Auth keys are set on the deployment.");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

main();
