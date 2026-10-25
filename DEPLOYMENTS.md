# Deployments

Live deployments of the Raisonné Foundation contracts, one section per network. Each
section records the contract addresses, the parameters the system was deployed with, and
the transactions that took it through its lifecycle.

The same addresses are kept machine-readable in `deployments/<chainId>.json`, and the
proposals in `proposals/<chainId>/`. The scripts read those files; this one is for people.

---

## Sepolia

Chain id `11155111`. Deployed on 2026-10-20 from
[`0x17b6641de7fad0d8d2d38CfAA780927746D536c0`](https://sepolia.etherscan.io/address/0x17b6641de7fad0d8d2d38CfAA780927746D536c0).
All six contracts are verified on Etherscan, compiled with solc 0.8.37.

### Addresses

| Contract | Address |
|---|---|
| `TimelockController` | [`0x7BF5F5086f81d17f0F786C668dF77D3323f8a2C6`](https://sepolia.etherscan.io/address/0x7BF5F5086f81d17f0F786C668dF77D3323f8a2C6) |
| `FundTreasury` (proxy) | [`0x3489a56aB9F42B39B2cB78DA0c7d124b02b97109`](https://sepolia.etherscan.io/address/0x3489a56aB9F42B39B2cB78DA0c7d124b02b97109) |
| `FundTreasury` (implementation) | [`0x7F1e7322Ff74DdF244a0443F33F8bE380F27f0Ca`](https://sepolia.etherscan.io/address/0x7F1e7322Ff74DdF244a0443F33F8bE380F27f0Ca) |
| `FundShare` | [`0xE5f29e986CC038E0d816b9b8d58118BDF539aF42`](https://sepolia.etherscan.io/address/0xE5f29e986CC038E0d816b9b8d58118BDF539aF42) |
| `FundGovernor` | [`0xe2b54dC53bB76Aa9F102A1E882e5D8F8Fc999f64`](https://sepolia.etherscan.io/address/0xe2b54dC53bB76Aa9F102A1E882e5D8F8Fc999f64) |
| `ArtRegistry` | [`0x62Fd289eB04ACE835c01748968a91519FBd19c49`](https://sepolia.etherscan.io/address/0x62Fd289eB04ACE835c01748968a91519FBd19c49) |

Every reference to the treasury is to the proxy. The implementation is listed only so its
verified source can be read.

### Parameters

| Parameter | Value |
|---|---|
| Voting delay | 300 seconds |
| Voting period | 900 seconds |
| Quorum | 40% of supply at the snapshot |
| Proposal threshold | 0 |
| Timelock delay | 300 seconds |
| Subscription window | 7 days from deployment |
| Clock | timestamp (ERC-6372 `mode=timestamp`) |

The governance windows are minutes rather than days so the whole lifecycle could run in
one sitting. They are testnet values: five minutes is not long enough for a minority
holder to exit before a proposal executes, which is the only protection the timelock
offers.

### Founding round

Four stakeholders, 0.045 ETH in total. Shares are minted one-to-one with wei contributed.

| Stakeholder | Contribution | Share of supply |
|---|---|---|
| `0x17b6641de7fad0d8d2d38CfAA780927746D536c0` | 0.01 ETH | 22.2% |
| `0xd40c83aB49061C87C7426F48b7a8B1d98003e411` | 0.01 ETH | 22.2% |
| `0x0FF39b611A3949fE2B1F6Ef720F81694AD52C4e2` | 0.0075 ETH | 16.7% |
| `0xcB6137a44D0c0AdE5c4926e8Bb9eB7D21fA2247c` | 0.0175 ETH | 38.9% |

### Lifecycle walkthrough

All times UTC.

#### 1. Deployment — 2026-10-20, blocks 11958427 to 11958438

Twelve transactions, in the order `RaisonneDeployer` sends them.

| Step | Transaction |
|---|---|
| Deploy `TimelockController` | [`0x483f2410e0e7a71797e79a0db1eccee98f9fa521b4085e5276fbe25dec7d02d6`](https://sepolia.etherscan.io/tx/0x483f2410e0e7a71797e79a0db1eccee98f9fa521b4085e5276fbe25dec7d02d6) |
| Deploy `FundTreasury` implementation | [`0x5116bd52bbb597adfef390937d10011b7cd7f82f54fac6492f023536789f2332`](https://sepolia.etherscan.io/tx/0x5116bd52bbb597adfef390937d10011b7cd7f82f54fac6492f023536789f2332) |
| Deploy `ERC1967Proxy`, running `initialize(deployer)` | [`0x3d8339f595e071c8e39ef5586d540ad9ff3991cf4567354b67be2db95663ae06`](https://sepolia.etherscan.io/tx/0x3d8339f595e071c8e39ef5586d540ad9ff3991cf4567354b67be2db95663ae06) |
| Deploy `FundShare` | [`0x4a9ebc8fceac2fb8805b2211979a520d565e5e1d6f65b2e4ce6dd56d1d1dcb02`](https://sepolia.etherscan.io/tx/0x4a9ebc8fceac2fb8805b2211979a520d565e5e1d6f65b2e4ce6dd56d1d1dcb02) |
| Deploy `FundGovernor` | [`0x26fe011413516788ae65d2d96b588600140fb697aef29482c8d5f734bd8b1fa8`](https://sepolia.etherscan.io/tx/0x26fe011413516788ae65d2d96b588600140fb697aef29482c8d5f734bd8b1fa8) |
| Deploy `ArtRegistry` | [`0x01a026478d3e25a4d511d8911a025d71eddc2308a308a82c45ecee67f82cae78`](https://sepolia.etherscan.io/tx/0x01a026478d3e25a4d511d8911a025d71eddc2308a308a82c45ecee67f82cae78) |
| `initializeRegistry(registry)` on the treasury | [`0x49ab75f8036c3cdb9ff06ec3f3ff972eebe453ee356a77b33d7b46a4faac38fa`](https://sepolia.etherscan.io/tx/0x49ab75f8036c3cdb9ff06ec3f3ff972eebe453ee356a77b33d7b46a4faac38fa) |
| Treasury ownership to the timelock | [`0x7a71900cd12f64cafe05f778289c80d55a7e380eb45ce5845598f9f96cb12b4e`](https://sepolia.etherscan.io/tx/0x7a71900cd12f64cafe05f778289c80d55a7e380eb45ce5845598f9f96cb12b4e) |
| `PROPOSER_ROLE` to the governor | [`0xee40969d305891f90a54ba43eb8a4f2682464510fd87ac09cd97ab58f538b7f0`](https://sepolia.etherscan.io/tx/0xee40969d305891f90a54ba43eb8a4f2682464510fd87ac09cd97ab58f538b7f0) |
| `CANCELLER_ROLE` to the governor | [`0xfabdb7dcedbcefc652b52e2649585b3c425349a5ec934f3c85600b8bc97d4e70`](https://sepolia.etherscan.io/tx/0xfabdb7dcedbcefc652b52e2649585b3c425349a5ec934f3c85600b8bc97d4e70) |
| `EXECUTOR_ROLE` to `address(0)` | [`0x8e22fd934e243be55c3973e6c8b54a5a6a49bf1281e50e89476fc7c7c5fa7cee`](https://sepolia.etherscan.io/tx/0x8e22fd934e243be55c3973e6c8b54a5a6a49bf1281e50e89476fc7c7c5fa7cee) |
| Deployer renounces `DEFAULT_ADMIN_ROLE` | [`0x1fc91454971d5307f686fa87c7d0e1908887c4b41508563dff14998e6bddf355`](https://sepolia.etherscan.io/tx/0x1fc91454971d5307f686fa87c7d0e1908887c4b41508563dff14998e6bddf355) |

After the last transaction the deployer holds no role on the timelock and owns nothing.

#### 2. Founding round — 2026-10-21

Each stakeholder subscribed with their exact agreed amount, and the round completed with
the fourth. `finalize()` then forwarded the 0.045 ETH to the treasury proxy.

| Step | Time | Transaction |
|---|---|---|
| Subscribe, 0.01 ETH, `0x17b6641de7fad0d8d2d38CfAA780927746D536c0` | 13:23:48 | [`0x5373c024ae2b8b6434a6def99dba243c218aa60778e0d02555bc73ea1a4b2ea7`](https://sepolia.etherscan.io/tx/0x5373c024ae2b8b6434a6def99dba243c218aa60778e0d02555bc73ea1a4b2ea7) |
| Subscribe, 0.01 ETH, `0xd40c83aB49061C87C7426F48b7a8B1d98003e411` | 13:25:24 | [`0x036c3cf04a77792defd910cad485b47d97e473185a991cd0759a4ea7b7d340c2`](https://sepolia.etherscan.io/tx/0x036c3cf04a77792defd910cad485b47d97e473185a991cd0759a4ea7b7d340c2) |
| Subscribe, 0.0075 ETH, `0x0FF39b611A3949fE2B1F6Ef720F81694AD52C4e2` | 13:26:24 | [`0xcb94d8b172e7307f496d7c6c76718253f1e9f67dcf656e62fb935d5ab058bc95`](https://sepolia.etherscan.io/tx/0xcb94d8b172e7307f496d7c6c76718253f1e9f67dcf656e62fb935d5ab058bc95) |
| Subscribe, 0.0175 ETH, `0xcB6137a44D0c0AdE5c4926e8Bb9eB7D21fA2247c` | 13:27:12 | [`0xbf53f05b91b343efd16f7420b7d469d13ed48993ea872fc1ceaadf0f3dc97d64`](https://sepolia.etherscan.io/tx/0xbf53f05b91b343efd16f7420b7d469d13ed48993ea872fc1ceaadf0f3dc97d64) |
| `finalize()` | 13:29:36 | [`0xa836b4661b148752a68e65c39a5105a0f8c5ec053bded0f7098567edd879ab71`](https://sepolia.etherscan.io/tx/0xa836b4661b148752a68e65c39a5105a0f8c5ec053bded0f7098567edd879ab71) |

#### 3. A proposal defeated by the delegation snapshot — 2026-10-22

The first acquisition proposal was submitted before any stakeholder had delegated, and it
failed for that reason.

| Step | Time | Transaction |
|---|---|---|
| `propose`, reverted out of gas | 09:44:48 | [`0x313d7b829bff9d0905f2f5861785599ddd159375606bcae791446cb42479285d`](https://sepolia.etherscan.io/tx/0x313d7b829bff9d0905f2f5861785599ddd159375606bcae791446cb42479285d) |
| `propose` | 09:47:00 | [`0x276ef8b839058db24428d8cb50fcf87a1fa1d6faf715433e48c5ed9dfff3389f`](https://sepolia.etherscan.io/tx/0x276ef8b839058db24428d8cb50fcf87a1fa1d6faf715433e48c5ed9dfff3389f) |
| Snapshot | 09:52:00 | — |
| Self-delegate, `0x17b6641de7fad0d8d2d38CfAA780927746D536c0` | 09:59:24 | [`0xb99b951fd3629ae7a6c7eb6747008d8c0c3e41c7a72d96130daff5103d4018ed`](https://sepolia.etherscan.io/tx/0xb99b951fd3629ae7a6c7eb6747008d8c0c3e41c7a72d96130daff5103d4018ed) |
| Self-delegate, `0xd40c83aB49061C87C7426F48b7a8B1d98003e411` | 10:01:24 | [`0x78645212d5e5fa77095541514afecaf8181b18e08d86f9db7a456ee1744b7089`](https://sepolia.etherscan.io/tx/0x78645212d5e5fa77095541514afecaf8181b18e08d86f9db7a456ee1744b7089) |
| Self-delegate, `0x0FF39b611A3949fE2B1F6Ef720F81694AD52C4e2` | 10:02:24 | [`0xdf0fc30fee26d18fb7accdb1e1619e21917a1e57259e74045414947546d7d1bc`](https://sepolia.etherscan.io/tx/0xdf0fc30fee26d18fb7accdb1e1619e21917a1e57259e74045414947546d7d1bc) |
| Self-delegate, `0xcB6137a44D0c0AdE5c4926e8Bb9eB7D21fA2247c` | 10:03:12 | [`0x6fea989cdf0454f0aac733b519a4606166bde65005a4584ee2b367876a2bf96d`](https://sepolia.etherscan.io/tx/0x6fea989cdf0454f0aac733b519a4606166bde65005a4584ee2b367876a2bf96d) |
| Vote For, `0x17b6641de7fad0d8d2d38CfAA780927746D536c0`, weight 0 | 10:03:48 | [`0x42d3aba1ec3e21adce5129a832deec0d910630baef958f8293da5920516e8203`](https://sepolia.etherscan.io/tx/0x42d3aba1ec3e21adce5129a832deec0d910630baef958f8293da5920516e8203) |
| Vote For, `0xd40c83aB49061C87C7426F48b7a8B1d98003e411`, weight 0 | 10:04:36 | [`0xb76a8d45d060684dabd13b327a6d17cd009cf17bd57f79a68fb08e756ec2e99f`](https://sepolia.etherscan.io/tx/0xb76a8d45d060684dabd13b327a6d17cd009cf17bd57f79a68fb08e756ec2e99f) |

Proposal id
`108502727883245482240516265267765087045095486190376873448842575765011817250039`.

Shares minted by `subscribe()` carry no voting power until their holder delegates;
`ERC20Votes` checkpoints delegated votes, not balances. The snapshot is taken at proposal
time plus the voting delay, 09:52:00 here, and every stakeholder delegated after it. Their
voting power at the snapshot was zero, both votes were recorded with zero weight, and the
proposal ended `Defeated` for want of quorum. Delegating afterwards could not rescue it:
the snapshot is fixed when the proposal is created, which is the whole point of it.

The out-of-gas revert before it is the failure described under *Build and test* in the
README.

#### 4. Acquisition 001 — 2026-10-22

The same action was proposed again. A Governor proposal id is the hash of targets,
values, calldatas, and the description hash, so resubmitting identical arguments would
have produced the id of the defeated proposal and reverted. The description changed by
one character — `Acquisition 001:` became `Acquisition 001 -` — and nothing else did.

| Step | Time | Transaction |
|---|---|---|
| `propose` | 10:12:12 | [`0xc1b5be9dad95efd45619ce6fad14d6fc75e0d67f339095aaf36670209a3edd8d`](https://sepolia.etherscan.io/tx/0xc1b5be9dad95efd45619ce6fad14d6fc75e0d67f339095aaf36670209a3edd8d) |
| Snapshot | 10:17:12 | — |
| Vote For, `0x17b6641de7fad0d8d2d38CfAA780927746D536c0`, weight 0.01 | 10:18:00 | [`0x2eda1fa4217101efbf95a10f6b4ac25fbfde4b1808a976e6d0c65daa659a47d5`](https://sepolia.etherscan.io/tx/0x2eda1fa4217101efbf95a10f6b4ac25fbfde4b1808a976e6d0c65daa659a47d5) |
| Vote For, `0xd40c83aB49061C87C7426F48b7a8B1d98003e411`, weight 0.01 | 10:19:12 | [`0x81885fd05f9da46654ed87839cfddbabd1a366a4e0346f1028fbd1851b1f86c1`](https://sepolia.etherscan.io/tx/0x81885fd05f9da46654ed87839cfddbabd1a366a4e0346f1028fbd1851b1f86c1) |
| Voting closes | 10:32:12 | — |
| `queue` | 10:35:00 | [`0x645a3b10c4bd377f854ca8cddc09aee686e4b16df62cf166ebd3c1b7f0c8c5f9`](https://sepolia.etherscan.io/tx/0x645a3b10c4bd377f854ca8cddc09aee686e4b16df62cf166ebd3c1b7f0c8c5f9) |
| `execute` | 10:43:24 | [`0xd55f9161739ef0d43a3b863ee0ce172cc8aceff4a856827bf3aba91897fa5eb0`](https://sepolia.etherscan.io/tx/0xd55f9161739ef0d43a3b863ee0ce172cc8aceff4a856827bf3aba91897fa5eb0) |

Proposal id
`32952886572218271093469220552281593952107488834825140914545209742028398695576`.

Two of the four stakeholders voted. Together they hold 0.02 of 0.045 shares, 44.4% of
supply, against a quorum of 0.018. The proposal passed with no votes cast by the holders
of the other 55.6%; quorum measures participation, not consent.

The proposal carried a single action, `addGallery` on `ArtRegistry` with root
`0xed415c54aef3a85048656fb73ee4056213060f55a183a87ae4d2c166d8ab6e36`. It had no
payment leg, so the treasury still holds the full 0.045 ETH. The tree behind the root is
`galleries/gallery-001.json`, pinned at
`ipfs://bafkreihk7nawgkl3ckfc6vjpkghdnz4qkbg3oc7n2l7qjedpxnpjnqhtim`, as the proposal
description states.

#### 5. Minting Acquisition 001 — 2026-10-22

Each artwork was minted with its own proof, in a separate transaction. All ten are owned
by the treasury proxy.

| Token | Work | Collection | Metadata | Transaction |
|---|---|---|---|---|
| 1 | Johannes Vermeer, *Girl with a Pearl Earring* | Mauritshuis | `ipfs://bafkreidrww2cim42ynm5yrhwnlid6mamrzfana3ypiomkpoyjbxxyfkhgu` | [`0xa84c4793e7a07171fbd41e84fbe9694f2c6cc9cda4b75a8527e23cac188dc48d`](https://sepolia.etherscan.io/tx/0xa84c4793e7a07171fbd41e84fbe9694f2c6cc9cda4b75a8527e23cac188dc48d) |
| 2 | Melchior d'Hondecoeter, *The Menagerie* | Rijksmuseum | `ipfs://bafkreia7uguevctwmgbqnhsiuahykk76l2gxl3ot5tkhfud7h2qn34vpci` | [`0x63d3b62f4f01f3e63bbccf4afcd607792fb35056eee9a67392def57e1f6cff1e`](https://sepolia.etherscan.io/tx/0x63d3b62f4f01f3e63bbccf4afcd607792fb35056eee9a67392def57e1f6cff1e) |
| 3 | Johannes Vermeer, *The Milkmaid* | Rijksmuseum | `ipfs://bafkreihgwltyf35vi2gle454ky7tuv4wbdzvtcwurgx2hiqbokoj63iaba` | [`0xc3c9f5595cbd263ffad6170df5fea4a32946e045f5c8e5562408e4dd7d087f9d`](https://sepolia.etherscan.io/tx/0xc3c9f5595cbd263ffad6170df5fea4a32946e045f5c8e5562408e4dd7d087f9d) |
| 4 | Frans Hals and Pieter Codde, *Militia Company of District XI* | Rijksmuseum | `ipfs://bafkreighvrynppfecjfox4qjz7rlnibezgumb6mixp4qu6nsrs65aslo3e` | [`0x62b6b8b0ae03a724146cc6a28e638ca0ecfea51acba8ce32864e43655ab8a3c4`](https://sepolia.etherscan.io/tx/0x62b6b8b0ae03a724146cc6a28e638ca0ecfea51acba8ce32864e43655ab8a3c4) |
| 5 | Marie Wandscheer, *Portrait of a Woman* | Rijksmuseum | `ipfs://bafkreierpgb3uixsytkv2jougexqmgqklkn23yegqijdqtbudtbiq2gm5m` | [`0xc0a8d5c096a44cce7c74d0b27d06600e8c20e7ef6a387095f05c4680bea96dd0`](https://sepolia.etherscan.io/tx/0xc0a8d5c096a44cce7c74d0b27d06600e8c20e7ef6a387095f05c4680bea96dd0) |
| 6 | Willem van de Velde II, *Encounter during the Battle of Kijkduin* | Rijksmuseum | `ipfs://bafkreiam4jkorc6onwpdzkcnit25q6iyhfot7p3kyztjeurr3znzsgoqye` | [`0x507d4fbab0c0611ad9391dc8a35e9687c2354cbeb24948912eef139449e39b90`](https://sepolia.etherscan.io/tx/0x507d4fbab0c0611ad9391dc8a35e9687c2354cbeb24948912eef139449e39b90) |
| 7 | Studio of Rembrandt, *Portrait of Rembrandt with a Gorget* | Mauritshuis | `ipfs://bafkreiavsqupwg2fnnindtej37ic3nmhrq7w2gl2tgc2z47sfwo2sacpw4` | [`0x336c894e534eff91af9e1236b6c806a9c7eba15bb68040ff56a0dbf93547e7a5`](https://sepolia.etherscan.io/tx/0x336c894e534eff91af9e1236b6c806a9c7eba15bb68040ff56a0dbf93547e7a5) |
| 8 | Claude-Joseph Vernet, *The Waterfalls at Tivoli* | Mauritshuis | `ipfs://bafkreick5q3afomaxiso2qxnumyx7ioogyjyfhtssbj4y3f26dp6zxfcci` | [`0x729dc31ca9c987b9b5dccb67397d44461c73cbc7f7d6e9270f76c6c815fb661a`](https://sepolia.etherscan.io/tx/0x729dc31ca9c987b9b5dccb67397d44461c73cbc7f7d6e9270f76c6c815fb661a) |
| 9 | Ohara Koson, *Tits on Cherry Branch* | Rijksmuseum | `ipfs://bafkreiaennmcl7vapv55tsc46ju6r5746kkduzn5mwedyi3usw3ikhlw7y` | [`0x2489efce17b67ae1abd6077fd92c1ba255be4f9e38a84146ec2faf4d2b398b8b`](https://sepolia.etherscan.io/tx/0x2489efce17b67ae1abd6077fd92c1ba255be4f9e38a84146ec2faf4d2b398b8b) |
| 10 | Jacob van Loo, *Amorous Couple* | Mauritshuis | `ipfs://bafkreiclovhv3g5oqbv5ftnkyx7fjgoj5ruu74thdg4kwb43mbnawamyvm` | [`0x42334474a6e78db76dd6476fcc74415330effb14a42b7dc389905c62d2876d8e`](https://sepolia.etherscan.io/tx/0x42334474a6e78db76dd6476fcc74415330effb14a42b7dc389905c62d2876d8e) |

The metadata documents for tokens 6 and 10 were pinned with `image` still set to the
template value `ipfs://REPLACE_WITH_IMAGE_CID`, so those two tokens have no image. The
registry behaved as designed. The CIDs are fixed at mint, and no transaction can repoint
either token at corrected metadata — not the deployer's, not the timelock's. An
append-only record handles an error by superseding the entry, not by editing it, and
that is what happened: Acquisition 002 reissued both works under new token ids with
corrected metadata. Tokens 6 and 10 remain minted, owned by the treasury, and still
resolve to the incomplete documents.

#### 6. Acquisition 002 — 2026-10-22

A second gallery, approved and minted through the same cycle, to replace tokens 6 and 10.
Every stakeholder had delegated since step 3, so voting power at this snapshot equalled
each holder's balance.

| Step | Time | Transaction |
|---|---|---|
| `propose`, reverted out of gas | 14:44:12 | [`0x36f605409411db39a528867465d462f49d649141e4a4b62e4380539fbeb62eea`](https://sepolia.etherscan.io/tx/0x36f605409411db39a528867465d462f49d649141e4a4b62e4380539fbeb62eea) |
| `propose` | 14:46:12 | [`0xc59377e6ea6c3196881e91cdd8994b1afaaa9ba770f3a0b2d7bf241bbae743a0`](https://sepolia.etherscan.io/tx/0xc59377e6ea6c3196881e91cdd8994b1afaaa9ba770f3a0b2d7bf241bbae743a0) |
| Snapshot | 14:51:12 | — |
| Vote For, `0x0FF39b611A3949fE2B1F6Ef720F81694AD52C4e2`, weight 0.0075 | 14:56:12 | [`0xf04c132605fdd97dcd55f97d35abf5013b49a81aa8536fb7c3ed094ce58798ea`](https://sepolia.etherscan.io/tx/0xf04c132605fdd97dcd55f97d35abf5013b49a81aa8536fb7c3ed094ce58798ea) |
| Vote For, `0xcB6137a44D0c0AdE5c4926e8Bb9eB7D21fA2247c`, weight 0.0175 | 14:56:48 | [`0x3e6923a464148c0d7acfde2cbbef55e2e8af4fcef91557954b73e8a4f24d0b9e`](https://sepolia.etherscan.io/tx/0x3e6923a464148c0d7acfde2cbbef55e2e8af4fcef91557954b73e8a4f24d0b9e) |
| Voting closes | 15:06:12 | — |
| `queue` | 15:07:36 | [`0x3da1477ca6381041345b563d13ca21994fbd319f5664f3573ff5cc88b90032e6`](https://sepolia.etherscan.io/tx/0x3da1477ca6381041345b563d13ca21994fbd319f5664f3573ff5cc88b90032e6) |
| `execute` | 15:14:24 | [`0x19d1bf4a74f47acda258133bfee1afd33d484e3c96b0f0332168a3349a398c46`](https://sepolia.etherscan.io/tx/0x19d1bf4a74f47acda258133bfee1afd33d484e3c96b0f0332168a3349a398c46) |
| Mint token 11 | 15:16:12 | [`0xfd4ee90457777343ebb16b6d013ea1631b8d56f8a16f17c2a018859f6297e50d`](https://sepolia.etherscan.io/tx/0xfd4ee90457777343ebb16b6d013ea1631b8d56f8a16f17c2a018859f6297e50d) |
| Mint token 12 | 15:16:36 | [`0xf7d2025304c548c4a57d185ead8f13cbc2b50f8fbd2e43600983efdfe248c550`](https://sepolia.etherscan.io/tx/0xf7d2025304c548c4a57d185ead8f13cbc2b50f8fbd2e43600983efdfe248c550) |

Proposal id
`87660538318577597511675749018373110013556100584854369158414624781261522036266`.

This time the other two stakeholders voted. They hold 0.025 of 0.045 shares, 55.6% of
supply, against a quorum of 0.018. Each acquisition passed on a different pair of
holders, and in each case the remaining holders cast no vote.

The proposal carried a single action, `addGallery` on `ArtRegistry` with root
`0xa44f697ab7918db0d018cac2681465b9d5771c3af63e57ede0a5da9bc072a92c`, committing a tree
of two leaves. The tree is `galleries/gallery-002.json`, pinned at
`ipfs://bafkreifrg2nslhcqnocdsdrprblekk5vdy3korpe2wxdfct5q7gj35m42i`. As with
Acquisition 001 there was no payment leg; the treasury still holds 0.045 ETH.

| Token | Work | Collection | Metadata | Replaces |
|---|---|---|---|---|
| 11 | Jacob van Loo, *Amorous Couple* | Mauritshuis | `ipfs://bafkreigry6qebfa6fjucwf27va22mcqrnkvjm34sxuapu6a5fkxrqtazcq` | 10 |
| 12 | Willem van de Velde II, *Encounter during the Battle of Kijkduin* | Rijksmuseum | `ipfs://bafkreifiixxk37r7r4dr3otk54atkk5ja3y4yqa4milimvqqihk4n7zn4m` | 6 |

The proposal description names the two works in the opposite order — Kijkduin first,
then Amorous Couple, "reissued as tokens 11 and 12". The committed tree is what binds a
token id to a CID, and in the tree token 11 is Amorous Couple. The prose is commentary
on the commitment and cannot override it, which is why voters are asked to rebuild the
root rather than read the description.

The Acquisition 001 root remains enabled. That has no effect on tokens 6 and 10:
a root authorises minting, both ids already exist, and minting an existing id reverts.

The treasury now holds twelve tokens. Ten resolve to complete metadata: tokens 1 to 5,
7 to 9, 11, and 12.
