RPC_URL ?= http://localhost:8545
DEPLOYER_KEY ?= 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

.PHONY: help build test test-unit test-integration test-invariant fmt lint \
        anvil deploy demo clean

help:
	@echo "Raisonné Foundation"
	@echo
	@echo "  make build              compile the contracts"
	@echo "  make test               run every suite"
	@echo "  make test-unit          run the unit suites only"
	@echo "  make test-integration   run the integration suite only"
	@echo "  make test-invariant     run the invariant suite only"
	@echo "  make fmt                format the sources"
	@echo "  make lint               check formatting without writing"
	@echo
	@echo "  make anvil              start a local node"
	@echo "  make deploy             deploy the system to \$$RPC_URL"
	@echo "  make demo               run the full lifecycle locally"
	@echo "  make clean              remove build artifacts"

build:
	forge build

test:
	forge test

test-unit:
	forge test --match-path "test/unit/*"

test-integration:
	forge test --match-path "test/integration/*"

test-invariant:
	forge test --match-path "test/invariant/*"

fmt:
	forge fmt

lint:
	forge fmt --check

anvil:
	anvil

deploy:
	forge script script/Deploy.s.sol \
		--rpc-url $(RPC_URL) \
		--broadcast \
		--private-key $(DEPLOYER_KEY)

demo:
	./script/local/demo.sh

clean:
	forge clean
