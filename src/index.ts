import { formatJsonRpcResult } from "@json-rpc-tools/utils";
import { Client, CLIENT_EVENTS } from "@walletconnect/client";
import { PairingTypes, SessionTypes } from "@walletconnect/types";

import {
  metadata,
  permissions,
  state,
  chainId,
  request,
  result,
} from "./constants";
import { getWsUrl } from "./utils";

async function testRelayProvider(url: string) {
  console.log("starting");
  // client opts
  const opts = { relayProvider: getWsUrl(url), metadata };

  // setup clients
  const clients = {
    a: await Client.init({ name: "A", ...opts }),
    b: await Client.init({ name: "B", ...opts, controller: true }),
  };

  let topic = "";

  // connect two clients
  await Promise.all([
    new Promise<void>(async (resolve, reject) => {
      const session = await clients.a.connect({ permissions });
      topic = session.topic;
      resolve();
    }),
    new Promise<void>(async (resolve, reject) => {
      clients.a.on(
        CLIENT_EVENTS.pairing.proposal,
        async (proposal: PairingTypes.Proposal) => {
          await clients.b.pair({ uri: proposal.signal.params.uri });
          resolve();
        }
      );
    }),
    new Promise<void>(async (resolve, reject) => {
      clients.b.on(
        CLIENT_EVENTS.session.proposal,
        async (proposal: SessionTypes.Proposal) => {
          await clients.b.approve({ proposal, response: { state } });
          resolve();
        }
      );
    }),
  ]);

  if (!topic) {
    throw new Error("Missing or invalid topic when checking");
  }

  let received: any = undefined;

  // request & respond a JSON-RPC request
  await Promise.all([
    new Promise<void>(async (resolve, reject) => {
      clients.b.on(
        CLIENT_EVENTS.session.request,
        async (requestEvent: SessionTypes.RequestEvent) => {
          if (
            requestEvent.topic === topic &&
            requestEvent.chainId === chainId
          ) {
            await clients.b.respond({
              topic,
              response: formatJsonRpcResult(requestEvent.request.id, result),
            });
            resolve();
          }
        }
      );
    }),
    new Promise<void>(async (resolve, reject) => {
      received = await clients.a.request({ topic, chainId, request });
      resolve();
    }),
  ]);

  if (!received || received !== result) {
    throw new Error("Incorrect result when checking");
  }

  return { success: true };
}

testRelayProvider("https://staging.walletconnect.org")
  .then(({ success }) => {
    console.log("SUC", success);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
