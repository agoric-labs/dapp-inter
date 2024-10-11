import {
  mnemonics,
  MINUTE_MS,
  networks,
  configMap,
  QUICK_WAIT,
  webWalletURL,
  webWalletSelectors,
  tokens,
  extractNumber,
} from '../test.utils';

describe('Wallet App Test Cases', () => {
  let startTime;
  const AGORIC_NET = Cypress.env('AGORIC_NET');
  const network = AGORIC_NET !== 'local' ? 'testnet' : 'local';
  const currentConfig = configMap[network];
  const DEFAULT_TIMEOUT = currentConfig.DEFAULT_TIMEOUT;
  const DEFAULT_TASK_TIMEOUT = currentConfig.DEFAULT_TASK_TIMEOUT;
  const LIQUIDATING_TIMEOUT = currentConfig.LIQUIDATING_TIMEOUT;
  const LIQUIDATED_TIMEOUT = currentConfig.LIQUIDATED_TIMEOUT;
  const user1Mnemonic = currentConfig.user1Mnemonic;
  const user1Address = currentConfig.user1Address;
  const bidderMnemonic = currentConfig.bidderMnemonic;
  const bidderAddress = currentConfig.bidderAddress;
  const bidderWalletName = currentConfig.bidderWalletName;
  const gov1Mnemonic = currentConfig.gov1Mnemonic;
  const gov1Address = currentConfig.gov1Address;
  const gov2Mnemonic = currentConfig.gov2Mnemonic;
  const gov2Address = currentConfig.gov2Address;
  const econGovURL = currentConfig.econGovURL;
  const auctionURL = currentConfig.auctionURL;
  const reserveURL = currentConfig.reserveURL;
  let bidderAtomBalance = 0;
  let bidderIstBalance = 0;
  let shortfallBalance = 0;

  context('Verify if both bidder and user1 have sufficient balance', () => {
    // Note: Transaction fees are not considered in these calculations.

    it('verify user1 balance is sufficient to create 3 vaults', () => {
      cy.getTokenBalance({
        walletAddress: user1Address,
        token: tokens.ATOM,
      }).then(balance => {
        expect(
          balance,
          'Balance should be more than 45 ATOMs',
        ).to.be.greaterThan(45);
      });
    });

    it('verify bidder balance is sufficient to place 3 bids', () => {
      cy.getTokenBalance({
        walletAddress: bidderAddress,
        token: tokens.IST,
      }).then(balance => {
        expect(
          balance,
          'Balance should be more than 100 ISTs',
        ).to.be.greaterThan(100);
      });
    });
  });

  context('Setting up accounts', () => {
    // Using exports from the synthetic-chain lib instead of hardcoding mnemonics UNTIL https://github.com/Agoric/agoric-3-proposals/issues/154
    it('should set up bidder wallet', () => {
      cy.skipWhen(AGORIC_NET === networks.LOCAL);

      cy.setupWallet({
        secretWords: bidderMnemonic,
        walletName: bidderWalletName,
      }).then(taskCompleted => {
        expect(taskCompleted).to.be.true;
      });
    });
    it('should set up user1 wallet', () => {
      cy.task('info', `AGORIC_NET: ${AGORIC_NET}`);
      cy.setupWallet({
        secretWords: user1Mnemonic,
        walletName: 'user1',
      }).then(taskCompleted => {
        expect(taskCompleted).to.be.true;
      });
    });

    it('should set up gov1 wallet', () => {
      cy.skipWhen(AGORIC_NET !== networks.LOCAL);

      cy.setupWallet({
        secretWords: mnemonics.gov1,
        walletName: 'gov1',
      }).then(taskCompleted => {
        expect(taskCompleted).to.be.true;
      });
    });

    it('should set up gov2 wallet', () => {
      cy.skipWhen(AGORIC_NET !== networks.LOCAL);

      cy.setupWallet({
        secretWords: mnemonics.gov2,
        walletName: 'gov2',
      }).then(taskCompleted => {
        expect(taskCompleted).to.be.true;
      });
    });
  });

  context('Adjusting manager params from econ-gov', () => {
    it('should connect with chain and wallet', () => {
      cy.skipWhen(AGORIC_NET !== networks.LOCAL);

      cy.visit(econGovURL);
      cy.acceptAccess().then(taskCompleted => {
        expect(taskCompleted).to.be.true;
      });
    });
    it('should allow gov2 to create a proposal', () => {
      cy.skipWhen(AGORIC_NET !== networks.LOCAL);

      cy.visit(econGovURL);
      cy.acceptAccess();

      cy.get('button').contains('Vaults').click();
      cy.get('button').contains('Select Manager').click();
      cy.get('button').contains('manager0').click();

      cy.get('label')
        .contains('LiquidationMargin')
        .parent()
        .within(() => {
          cy.get('input').clear();
          cy.get('input').type('150');
        });

      cy.get('label')
        .contains('LiquidationPadding')
        .parent()
        .within(() => {
          cy.get('input').clear();
          cy.get('input').type('25');
        });

      cy.get('label')
        .contains('LiquidationPenalty')
        .parent()
        .within(() => {
          cy.get('input').clear();
          cy.get('input').type('1');
        });

      cy.get('label')
        .contains('StabilityFee')
        .parent()
        .within(() => {
          cy.get('input').clear();
          cy.get('input').type('1');
        });

      cy.get('label')
        .contains('MintFee')
        .parent()
        .within(() => {
          cy.get('input').clear();
          cy.get('input').type('0.5');
        });

      cy.get('label')
        .contains('Minutes until close of vote')
        .parent()
        .within(() => {
          cy.get('input').clear();
          cy.get('input').type(1);
        });
      cy.get('[value="Propose Parameter Change"]').click();

      cy.confirmTransaction();
      cy.get('p')
        .contains('sent')
        .should('be.visible')
        .then(() => {
          startTime = Date.now();
        });
    });

    it('should allow gov2 to vote on the proposal', () => {
      cy.skipWhen(AGORIC_NET !== networks.LOCAL);

      cy.visit(econGovURL);

      cy.get('button').contains('Vote').click();
      cy.get('p').contains('YES').click();
      cy.get('input:enabled[value="Submit Vote"]').click();

      cy.confirmTransaction();
      cy.get('p').contains('sent').should('be.visible');
    });

    it('should allow gov1 to vote on the proposal', () => {
      cy.skipWhen(AGORIC_NET !== networks.LOCAL);

      cy.switchWallet('gov1');
      cy.visit(econGovURL);

      cy.get('button').contains('Vote').click();
      cy.get('p').contains('YES').click();
      cy.get('input:enabled[value="Submit Vote"]').click();

      cy.confirmTransaction();
      cy.get('p').contains('sent').should('be.visible');
    });

    it('should wait for proposal to pass', () => {
      cy.skipWhen(AGORIC_NET !== networks.LOCAL);

      cy.wait(MINUTE_MS - Date.now() + startTime);
      cy.visit(econGovURL);

      cy.get('button').contains('History').click();

      cy.get('code')
        .contains('VaultFactory - ATOM')
        .parent()
        .parent()
        .parent()
        .within(() => {
          cy.get('span').contains('Change Accepted').should('be.visible');
        });
    });
  });

  context('Adjusting auction params from econ-gov', () => {
    it('should allow gov1 to create a proposal', () => {
      cy.skipWhen(AGORIC_NET !== networks.LOCAL);

      cy.visit(econGovURL);

      cy.get('button').contains('Vaults').click();
      cy.get('button').contains('Change Manager Params').click();
      cy.get('button').contains('Change Auctioneer Params').click();

      cy.get('label')
        .contains('StartingRate')
        .parent()
        .within(() => {
          cy.get('input').clear();
          cy.get('input').type('10500');
        });

      cy.get('label')
        .contains('LowestRate')
        .parent()
        .within(() => {
          cy.get('input').clear();
          cy.get('input').type('6500');
        });

      cy.get('label')
        .contains('DiscountStep')
        .parent()
        .within(() => {
          cy.get('input').clear();
          cy.get('input').type('500');
        });

      cy.get('label')
        .contains('AuctionStartDelay')
        .parent()
        .within(() => {
          cy.get('input').clear();
          cy.get('input').type('2');
        });

      cy.get('label')
        .contains('Minutes until close of vote')
        .parent()
        .within(() => {
          cy.get('input').clear();
          cy.get('input').type(1);
        });
      cy.get('[value="Propose Parameter Change"]').click();

      cy.confirmTransaction();
      cy.get('p')
        .contains('sent')
        .should('be.visible')
        .then(() => {
          startTime = Date.now();
        });
    });

    it('should allow gov1 to vote on the proposal', () => {
      cy.skipWhen(AGORIC_NET !== networks.LOCAL);

      cy.visit(econGovURL);

      cy.get('button').contains('Vote').click();
      cy.get('p').contains('YES').click();
      cy.get('input:enabled[value="Submit Vote"]').click();

      cy.confirmTransaction();
      cy.get('p').contains('sent').should('be.visible');
    });

    it('should allow gov2 to vote on the proposal', () => {
      cy.skipWhen(AGORIC_NET !== networks.LOCAL);

      cy.switchWallet('gov2');
      cy.visit(econGovURL);

      cy.get('button').contains('Vote').click();
      cy.get('p').contains('YES').click();
      cy.get('input:enabled[value="Submit Vote"]').click();

      cy.confirmTransaction();
      cy.get('p').contains('sent').should('be.visible');
    });

    it('should wait for proposal to pass', () => {
      cy.skipWhen(AGORIC_NET !== networks.LOCAL);

      cy.wait(MINUTE_MS - Date.now() + startTime);
      cy.visit(econGovURL);

      cy.get('button').contains('History').click();

      cy.get('code')
        .contains('VaultFactory - ATOM')
        .parent()
        .parent()
        .parent()
        .within(() => {
          cy.get('span').contains('Change Accepted').should('be.visible');
        });

      cy.switchWallet('user1');
    });
  });

  context('Creating vaults and changing ATOM price', () => {
    it(
      'should connect with the wallet',
      {
        defaultCommandTimeout: DEFAULT_TIMEOUT,
        taskTimeout: DEFAULT_TASK_TIMEOUT,
      },
      () => {
        cy.connectWithWallet();
      },
    );

    it('should add all the keys successfully', () => {
      cy.addKeys({
        keyName: 'gov1',
        mnemonic: gov1Mnemonic,
        expectedAddress: gov1Address,
      });
      cy.addKeys({
        keyName: 'gov2',
        mnemonic: gov2Mnemonic,
        expectedAddress: gov2Address,
      });
      cy.addKeys({
        keyName: 'user1',
        mnemonic: user1Mnemonic,
        expectedAddress: user1Address,
      });
    });

    it('should add the bidder key successfully', () => {
      cy.skipWhen(AGORIC_NET === networks.LOCAL);
      cy.addKeys({
        keyName: 'bidder',
        mnemonic: bidderMnemonic,
        expectedAddress: bidderAddress,
      });
    });
    it('should set ATOM price to 12.34', () => {
      cy.setOraclePrice(12.34);
    });
    it('should create a vault minting 100 ISTs and giving 15 ATOMs as collateral', () => {
      cy.createVault({ wantMinted: 100, giveCollateral: 15, userKey: 'user1' });
    });

    it('should create a vault minting 103 ISTs and giving 15 ATOMs as collateral', () => {
      cy.createVault({ wantMinted: 103, giveCollateral: 15, userKey: 'user1' });
    });

    it('should create a vault minting 105 ISTs and giving 15 ATOMs as collateral', () => {
      cy.createVault({ wantMinted: 105, giveCollateral: 15, userKey: 'user1' });
    });

    it(
      'should check for the existence of vaults on the UI',
      {
        defaultCommandTimeout: DEFAULT_TIMEOUT,
        taskTimeout: DEFAULT_TASK_TIMEOUT,
      },
      () => {
        cy.contains('button', 'Back to vaults').click();
        cy.scrollTo('bottom', { ensureScrollable: false });
        cy.contains('100.50 IST').should('exist');
        cy.contains('103.51 IST').should('exist');
        cy.contains('105.52 IST').should('exist');
      },
    );
  });

  context(
    'Place bids and make all vaults enter liquidation',
    {
      defaultCommandTimeout: DEFAULT_TIMEOUT,
      taskTimeout: DEFAULT_TASK_TIMEOUT,
    },
    () => {
      it('should save bidder ATOM balance before placing bids', () => {
        cy.wait(QUICK_WAIT);
        cy.getTokenBalance({
          walletAddress: bidderAddress,
          token: tokens.ATOM,
        }).then(output => {
          bidderAtomBalance = Number(output.toFixed(3));
          cy.task('info', `bidderAtomBalance: ${bidderAtomBalance}`);
        });
      });

      it('should save bidder IST balance before placing bid', () => {
        cy.getTokenBalance({
          walletAddress: bidderAddress,
          token: tokens.IST,
        }).then(output => {
          bidderIstBalance = Number(output.toFixed(2));
          cy.task('info', `bidder IST Balance: ${bidderIstBalance}`);
        });
      });

      it('should save current value of shortfall balance', () => {
        cy.fetchVStorageData({
          url: reserveURL,
          field: 'shortfallBalance',
          latest: true,
        }).then(output => {
          shortfallBalance = Number(Number(output.value.slice(1)).toFixed(2));
          cy.task('info', `Current Shortfall balance: ${shortfallBalance}`);
        });
      });

      it('should place bids from the CLI successfully', () => {
        cy.switchWallet(bidderWalletName);
        cy.addNewTokensFound();

        cy.placeBidByDiscount({
          fromAddress: bidderAddress,
          giveAmount: '75IST',
          discount: 22,
        });

        cy.placeBidByDiscount({
          fromAddress: bidderAddress,
          giveAmount: '25IST',
          discount: 30,
        });
      });

      it("should see decrease in bidder's IST balance after placing bid", () => {
        cy.wait(QUICK_WAIT);
        cy.getTokenBalance({
          walletAddress: bidderAddress,
          token: tokens.IST,
        }).then(newBalance => {
          cy.task('info', `Initial Balance: ${bidderIstBalance}`);
          cy.task('info', `New Balance: ${newBalance}`);
          expect(newBalance).to.be.lessThan(bidderIstBalance);
          bidderIstBalance = newBalance;
        });
      });

      it('should set ATOM price to 9.99', () => {
        cy.setOraclePrice(9.99);
      });

      it('should verify vaults that are at a risk of being liquidated', () => {
        cy.switchWallet('user1');
        cy.contains(
          /Please increase your collateral or repay your outstanding IST debt./,
        );
      });

      it('should wait and verify vaults are being liquidated', () => {
        cy.contains(/3 vaults are liquidating./, {
          timeout: LIQUIDATING_TIMEOUT,
        });
      });
    },
  );

  context('Verify auction values while vaults are LIQUIDATING', () => {
    it('should verify the value of startPrice', () => {
      cy.wait(QUICK_WAIT);

      if (AGORIC_NET === networks.LOCAL) {
        const expectedValue = 9.99;
        cy.task('info', `Expected Value: ${expectedValue}`);
        cy.fetchVStorageData({
          url: auctionURL,
          field: 'startPrice',
        }).then(data => {
          cy.calculateRatios(data, { hasDenom: true, useValue: false }).then(
            result => {
              const valueFound = result.includes(expectedValue);
              expect(valueFound).to.be.true;
            },
          );
        });
      } else {
        const propertyName = 'startPrice';
        const expectedValue = '9.99 IST/ATOM';
        cy.task('info', `Expected Value: ${expectedValue}`);
        cy.getAuctionParam(propertyName).then(value => {
          const actualValue = extractNumber(value);
          const expectedValueRounded = extractNumber(expectedValue);

          expect(actualValue).to.eq(expectedValueRounded);
        });
      }
    });

    it('should verify the value of startProceedsGoal', () => {
      if (AGORIC_NET === networks.LOCAL) {
        const expectedValue = 309.54;
        cy.task('info', `Expected Value: ${expectedValue}`);
        cy.fetchVStorageData({
          url: auctionURL,
          field: 'startProceedsGoal',
        }).then(data => {
          cy.calculateRatios(data, { hasDenom: false, useValue: true }).then(
            result => {
              const valueFound = result.includes(expectedValue);
              expect(valueFound).to.be.true;
            },
          );
        });
      } else {
        const propertyName = 'startProceedsGoal';
        const expectedValue = '309.54 IST';
        cy.task('info', `Expected Value: ${expectedValue}`);
        cy.getAuctionParam(propertyName).then(value => {
          cy.task(
            'info',
            'Comparing actual and expected values rounded to one decimal place.',
          );

          const actualValue = Math.round(extractNumber(value) * 10) / 10;
          const expectedValueRounded =
            Math.round(extractNumber(expectedValue) * 10) / 10;

          expect(actualValue).to.eq(expectedValueRounded);
        });
      }
    });

    it('should verify the value of startCollateral', () => {
      if (AGORIC_NET === networks.LOCAL) {
        const expectedValue = 45;
        cy.task('info', `Expected Value: ${expectedValue}`);
        cy.fetchVStorageData({
          url: auctionURL,
          field: 'startCollateral',
        }).then(data => {
          cy.calculateRatios(data, { hasDenom: false, useValue: true }).then(
            result => {
              const valueFound = result.includes(expectedValue);
              expect(valueFound).to.be.true;
            },
          );
        });
      } else {
        const propertyName = 'startCollateral';
        const expectedValue = '45 ATOM';
        cy.task('info', `Expected Value: ${expectedValue}`);
        cy.getAuctionParam(propertyName).then(value => {
          const actualValue = extractNumber(value);
          const expectedValueRounded = extractNumber(expectedValue);

          expect(actualValue).to.eq(expectedValueRounded);
        });
      }
    });
  });

  context(
    'Wait for two vaults to be RECONSTITUTED and one to be LIQUIDATED',
    () => {
      it('should verify 2 vaults are reconstituted', () => {
        cy.contains(
          /Please increase your collateral or repay your outstanding IST debt./,
          { timeout: LIQUIDATING_TIMEOUT },
        );
      });

      it(
        'should verify a vault is liquidated',
        {
          defaultCommandTimeout: DEFAULT_TIMEOUT,
          taskTimeout: DEFAULT_TASK_TIMEOUT,
        },
        () => {
          cy.contains(/Collateral left to claim/, {
            timeout: LIQUIDATED_TIMEOUT,
          });
          cy.contains(/0.00 ATOM/);
        },
      );

      it('should verify the value of collateralAvailable', () => {
        cy.wait(QUICK_WAIT);

        if (AGORIC_NET === networks.LOCAL) {
          const expectedValue = 31.414987;
          cy.task('info', `Expected Value: ${expectedValue}`);
          cy.fetchVStorageData({
            url: auctionURL,
            field: 'collateralAvailable',
          }).then(data => {
            cy.calculateRatios(data, { hasDenom: false, useValue: true }).then(
              result => {
                const valueFound = result.includes(expectedValue);
                expect(valueFound).to.be.true;
              },
            );
          });
        } else {
          const propertyName = 'collateralAvailable';
          const expectedValue = '31.414987 ATOM';
          cy.task('info', `Expected Value: ${expectedValue}`);
          cy.getAuctionParam(propertyName).then(value => {
            cy.task(
              'info',
              'Comparing actual and expected values rounded to one decimal place.',
            );

            const actualValue = Math.round(extractNumber(value) * 10) / 10;
            const expectedValueRounded =
              Math.round(extractNumber(expectedValue) * 10) / 10;

            expect(actualValue).to.eq(expectedValueRounded);
          });
        }
      });
    },
  );

  context('Verification of Shortfall balance', () => {
    it('should see an increase of 5.525 IST in shortfall balance', () => {
      const expectedValue = 5.525;
      cy.task('info', `Expected: ${expectedValue}`);

      cy.fetchVStorageData({
        url: reserveURL,
        field: 'shortfallBalance',
        latest: true,
      }).then(newBalanceObj => {
        let newBalance = Number(
          (Number(newBalanceObj.value.slice(1)) / 1_000_000).toFixed(2),
        );
        cy.task('info', `Initial shortfallBalance: ${shortfallBalance}`);
        cy.task('info', `New shortfallBalance: ${JSON.stringify(newBalance)}`);

        const balanceIncrease = Number(
          (newBalance - shortfallBalance).toFixed(2),
        );
        cy.task('info', `Actual increase: ${balanceIncrease}`);

        expect(balanceIncrease).to.eq(expectedValue);
      });
    });
  });

  context('Verification of Filled Bids', () => {
    it("should see increase in the bidder's ATOM balance", () => {
      const expectedValue = 13.585;
      cy.task(
        'info',
        `Expected increase due to completely filled bids: ${expectedValue}`,
      );

      cy.getTokenBalance({
        walletAddress: bidderAddress,
        token: tokens.ATOM,
      }).then(newBalance => {
        cy.task('info', `Initial Balance: ${bidderAtomBalance}`);
        cy.task('info', `New Balance: ${newBalance}`);

        const balanceIncrease = Number(
          (newBalance - bidderAtomBalance).toFixed(3),
        );
        cy.task('info', `Actual increase: ${balanceIncrease}`);
        bidderAtomBalance = Number(newBalance.toFixed(2));

        expect(balanceIncrease).to.eq(expectedValue);
      });
    });

    it('should switch to the bidder wallet successfully', () => {
      cy.switchWallet(bidderWalletName);
    });

    it('should setup the web wallet and not see any bids', () => {
      cy.skipWhen(AGORIC_NET === networks.LOCAL);
      cy.visit(webWalletURL);

      cy.acceptAccess().then(taskCompleted => {
        expect(taskCompleted).to.be.true;
      });

      cy.visit(`${webWalletURL}/wallet/`);

      cy.get('input[type="checkbox"]').check();
      cy.contains('Proceed').click();
      cy.get('button[aria-label="Settings"]').click();

      cy.contains('div', 'Mainnet').click();
      cy.contains('li', webWalletSelectors[AGORIC_NET]).click();
      cy.contains('button', 'Connect').click();

      cy.acceptAccess().then(taskCompleted => {
        expect(taskCompleted).to.be.true;
      });

      cy.reload();

      cy.get('span')
        .contains('ATOM', { timeout: DEFAULT_TIMEOUT })
        .should('exist');
      cy.get('span')
        .contains('BLD', { timeout: DEFAULT_TIMEOUT })
        .should('exist');

      cy.contains('75.00 IST', { timeout: DEFAULT_TIMEOUT }).should(
        'not.exist',
      );
      cy.contains('25.00 IST', { timeout: DEFAULT_TIMEOUT }).should(
        'not.exist',
      );
    });
  });

  context(
    'Close the vaults and restore ATOM price to 12.34 on TESTNET(s).',
    () => {
      it('should close the 100 IST vault and approve the transaction successfully', () => {
        cy.skipWhen(AGORIC_NET === networks.LOCAL);
        const regexVault100 = new RegExp('100(\\.\\d+)?');
        cy.contains(regexVault100, { timeout: LIQUIDATING_TIMEOUT }).click();
        cy.contains('Close Out Vault').click();
        cy.contains('button.bg-interPurple', 'Close Out Vault').click();

        cy.confirmTransaction().then(taskCompleted => {
          expect(taskCompleted).to.be.true;
          cy.contains('button.bg-interPurple', 'Close Out Vault').should(
            'not.exist',
          );
        });
      });

      it('should close the 103 IST vault and approve the transaction successfully', () => {
        cy.skipWhen(AGORIC_NET === networks.LOCAL);
        const regexVault103 = new RegExp('103(\\.\\d+)?');
        cy.contains(regexVault103, { timeout: LIQUIDATING_TIMEOUT }).click();
        cy.contains('Close Out Vault').click();
        cy.contains('button.bg-interPurple', 'Close Out Vault').click();

        cy.confirmTransaction().then(taskCompleted => {
          expect(taskCompleted).to.be.true;
          cy.contains('button.bg-interPurple', 'Close Out Vault').should(
            'not.exist',
          );
        });
      });

      it('should set ATOM price back to 12.34', () => {
        cy.skipWhen(AGORIC_NET === networks.LOCAL);
        cy.setOraclePrice(12.34);
      });
    },
  );
});
