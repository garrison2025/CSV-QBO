/**
 * Unmodified fictional examples from Maxed-OSS/statement-normalizer
 * https://github.com/Maxed-OSS/statement-normalizer/tree/main/examples
 * Original work under Apache License 2.0; see THIRD-PARTY-TEST-FIXTURES.md.
 * These are independent, externally-authored MOCK bank layouts, NOT exports
 * from actual authorized live bank accounts or target-software import evidence.
 */
export const externalSamples=[
  {
    name:'Chase-style checking',
    source:'examples/chase_checking.csv',
    input:'csv',count:5,net:'1225.50',mapping:{date:1,description:2,amount:3,debit:-1,credit:-1,id:6,memo:-1},
    text:"Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #\nDEBIT,01/05/2024,GAS STATION 4471,-45.20,ACH_DEBIT,1954.80,\nCREDIT,01/06/2024,PAYROLL DIRECT DEP ACME,2500.00,ACH_CREDIT,4454.80,\nDEBIT,01/08/2024,GREEN GROCER MARKET,-62.40,DEBIT_CARD,4392.40,\nDEBIT,01/10/2024,CHECK PAID #1042,-1200.00,CHECK,3192.40,1042\nCREDIT,01/15/2024,REFUND ONLINE RETAILER,33.10,ACH_CREDIT,3225.50,\n"
  },
  {
    name:'Bank of America-style checking',
    source:'examples/bofa_checking.csv',
    input:'csv',count:5,net:'2307.28',mapping:{date:0,description:1,amount:2,debit:-1,credit:-1,id:-1,memo:-1},
    text:"Date,Description,Amount,Running Bal.\n01/05/2024,\"GAS STATION 4471 PURCHASE\",-45.20,\"1,954.80\"\n01/06/2024,\"DIRECT DEPOSIT PAYROLL ACME CORP\",2500.00,\"4,454.80\"\n01/08/2024,\"GREEN GROCER MARKET DES:PURCHASE\",-62.40,\"4,392.40\"\n01/12/2024,\"ELECTRIC UTILITY CO BILL PAY\",-118.22,\"4,274.18\"\n01/15/2024,\"ONLINE RETAILER REFUND\",33.10,\"4,307.28\"\n"
  },
  {
    name:'Wells Fargo-style checking, blank Payee with content in Memo',
    source:'examples/wells_fargo_checking.csv',
    input:'csv',count:5,net:'1119.22',mapping:{date:0,description:4,amount:1,debit:-1,credit:-1,id:-1,memo:-1},
    requiresExplicitDescriptionRemap:true,
    text:"Date,Amount,Asterisk,Payee,Memo\n01/05/2024,-45.20,*,,GAS STATION 4471 PURCHASE AUTHORIZED\n01/06/2024,2500.00,*,,PAYROLL ACME CORP DIRECT DEP\n01/08/2024,-62.40,*,,GREEN GROCER MARKET PURCHASE\n01/10/2024,-1200.00,*,,CHECK # 1042\n01/14/2024,-73.18,*,,GROCERY OUTLET PURCHASE\n"
  },
  {
    name:'American Express-style credit card (charges positive, manual sign review)',
    source:'examples/amex_creditcard.csv',
    input:'csv',count:6,net:'-31.27',mapping:{date:0,description:1,amount:2,debit:-1,credit:-1,id:-1,memo:-1},
    creditCardSignsNeedTargetReview:true,
    text:"Date,Description,Amount\n02/01/2024,GAS STATION 4471,45.20\n02/02/2024,STREAMING SERVICE MONTHLY,15.99\n02/03/2024,RESTAURANT BISTRO 88,82.35\n02/05/2024,ONLINE PAYMENT - THANK YOU,-250.00\n02/07/2024,ONLINE BOOKSTORE,29.99\n02/09/2024,GAS STATION 4471,45.20\n"
  },
  {
    name:'Capital One-style credit card (split Debit/Credit)',
    source:'examples/capital_one_creditcard.csv',
    input:'csv',count:5,net:'76.47',mapping:{date:1,description:3,amount:-1,debit:5,credit:6,id:-1,memo:-1},
    creditCardSignsNeedTargetReview:true,
    text:"Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit\n2024-02-01,2024-02-02,1234,GAS STATION 4471,Gas,45.20,\n2024-02-02,2024-02-03,1234,STREAMING SERVICE MONTHLY,Entertainment,15.99,\n2024-02-03,2024-02-04,1234,RESTAURANT BISTRO 88,Dining,82.35,\n2024-02-05,2024-02-06,1234,CAPITAL ONE PAYMENT,Payment/Credit,,250.00\n2024-02-07,2024-02-08,1234,ONLINE BOOKSTORE,Merchandise,29.99,\n"
  },
  {
    name:'Discover-style credit card (charges positive, manual sign review)',
    source:'examples/discover_creditcard.csv',
    input:'csv',count:5,net:'-86.68',mapping:{date:1,description:2,amount:3,debit:-1,credit:-1,id:-1,memo:-1},
    creditCardSignsNeedTargetReview:true,
    text:"Trans. Date,Post Date,Description,Amount,Category\n01/05/2024,01/06/2024,GAS STATION 4471,45.20,Gasoline\n01/08/2024,01/09/2024,GREEN GROCER MARKET,62.40,Supermarkets\n01/12/2024,01/13/2024,ELECTRIC UTILITY CO,118.22,Utilities\n01/20/2024,01/21/2024,DIRECT PAYMENT - THANK YOU,-300.00,Payments and Credits\n01/22/2024,01/23/2024,CASHBACK BONUS REDEMPTION,-12.50,Awards and Rebate Credits\n"
  },
  {
    name:'Quicken QIF with apostrophe year and ignored categories',
    source:'examples/sample.qif',
    input:'qif',count:4,net:'1213.51',
    text:"!Type:Bank\nD03/01/2024\nT-58.99\nN2044\nPCORNER MARKET\nMGroceries\nLFood:Groceries\n^\nD03/04/2024\nT1,800.00\nPPAYROLL DEPOSIT\nLIncome:Salary\n^\nD03/09/2024\nT-95.40\nPCITY POWER UTILITY\nMMonthly electricity\nLBills:Utilities\n^\nD03/15'24\nT-432.10\nPRENT TRANSFER\n^\n"
  }
];
