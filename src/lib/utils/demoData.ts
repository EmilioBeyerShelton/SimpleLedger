// Generates a realistic-looking LedgerData tree for trying the app out —
// wired up from Settings ("Load demo data"). Pure function, no React/DOM,
// per the project rule that business/data logic stays out of components.
// Dates are generated relative to "today" so the demo always looks current
// regardless of when it's loaded.
import type { LedgerData, Transaction, Group, GroupTransaction } from '@/types/ledger';

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
}

export function generateDemoData(): LedgerData {
  const accounts = [
    { id: 'assets.bank_accounts.checkings', title: 'Checking' },
    { id: 'assets.bank_accounts.savings', title: 'Savings' },
    { id: 'assets.cash', title: 'Cash' },
    { id: 'income.salary', title: 'Salary' },
    { id: 'expenses.groceries', title: 'Groceries' },
    { id: 'expenses.dining', title: 'Dining out' },
    { id: 'expenses.transport', title: 'Transport' },
    { id: 'expenses.entertainment', title: 'Entertainment' },
    { id: 'expenses.rent', title: 'Rent' },
    { id: 'expenses.utilities', title: 'Utilities' },
    { id: 'expenses.shopping', title: 'Shopping' },
    { id: 'expenses.health', title: 'Health' }
  ];

  // [daysAgo, title, amount, from, to]
  const rows: [number, string, number, string, string][] = [
    [58, 'Paycheck', 2800, 'income.salary', 'assets.bank_accounts.checkings'],
    [56, 'Rent', 1200, 'assets.bank_accounts.checkings', 'expenses.rent'],
    [55, 'Electric bill', 64.32, 'assets.bank_accounts.checkings', 'expenses.utilities'],
    [54, 'Whole Foods', 87.45, 'assets.bank_accounts.checkings', 'expenses.groceries'],
    [52, 'Uber', 18.2, 'assets.cash', 'expenses.transport'],
    [50, 'Movie night', 32.0, 'assets.bank_accounts.checkings', 'expenses.entertainment'],
    [48, 'Trader Joe\'s', 54.1, 'assets.bank_accounts.checkings', 'expenses.groceries'],
    [45, 'Gas station', 41.75, 'assets.cash', 'expenses.transport'],
    [43, 'Pizza night', 28.5, 'assets.bank_accounts.checkings', 'expenses.dining'],
    [41, 'Internet bill', 59.99, 'assets.bank_accounts.checkings', 'expenses.utilities'],
    [40, 'Transfer to savings', 400, 'assets.bank_accounts.checkings', 'assets.bank_accounts.savings'],
    [38, 'Pharmacy', 22.3, 'assets.cash', 'expenses.health'],
    [35, 'New shoes', 89.99, 'assets.bank_accounts.checkings', 'expenses.shopping'],
    [33, 'Coffee shop', 6.75, 'assets.cash', 'expenses.dining'],
    [30, 'Paycheck', 2800, 'income.salary', 'assets.bank_accounts.checkings'],
    [29, 'Rent', 1200, 'assets.bank_accounts.checkings', 'expenses.rent'],
    [28, 'Costco run', 143.2, 'assets.bank_accounts.checkings', 'expenses.groceries'],
    [26, 'Water bill', 31.5, 'assets.bank_accounts.checkings', 'expenses.utilities'],
    [24, 'Concert tickets', 75.0, 'assets.bank_accounts.checkings', 'expenses.entertainment'],
    [22, 'Sushi dinner', 46.8, 'assets.bank_accounts.checkings', 'expenses.dining'],
    [20, 'Metro card', 33.0, 'assets.cash', 'expenses.transport'],
    [18, 'Grocery run', 61.9, 'assets.bank_accounts.checkings', 'expenses.groceries'],
    [15, 'Streaming subscription', 15.99, 'assets.bank_accounts.checkings', 'expenses.entertainment'],
    [12, 'Doctor visit copay', 40.0, 'assets.bank_accounts.checkings', 'expenses.health'],
    [10, 'Farmers market', 27.6, 'assets.cash', 'expenses.groceries'],
    [8, 'Gas station', 38.4, 'assets.cash', 'expenses.transport'],
    [6, 'Brunch with friends', 34.5, 'assets.bank_accounts.checkings', 'expenses.dining'],
    [4, 'Bookstore', 24.99, 'assets.bank_accounts.checkings', 'expenses.shopping'],
    [2, 'Groceries', 72.15, 'assets.bank_accounts.checkings', 'expenses.groceries'],
    [1, 'Coffee', 5.25, 'assets.cash', 'expenses.dining'],
    [0, 'Paycheck', 2800, 'income.salary', 'assets.bank_accounts.checkings']
  ];

  const transactions: Transaction[] = rows.map((r, i) => ({
    id: i + 1,
    date: daysAgoStr(r[0]),
    title: r[1],
    amount: r[2],
    from: r[3],
    to: r[4]
  }));

  const findTx = (title: string) => transactions.find(t => t.title === title)!.id;

  const groups: Group[] = [
    { id: 1, name: 'Roommates — groceries', members: ['Alex', 'Sam', 'Jordan'], budget: 600 },
    { id: 2, name: 'Weekend trip', members: ['Alex', 'Priya'], budget: null }
  ];

  const groupTransactions: GroupTransaction[] = [
    {
      id: 1,
      groupId: 1,
      transactionId: findTx('Costco run'),
      splits: [
        { member: 'Alex', amount: 47.73 },
        { member: 'Sam', amount: 47.73 },
        { member: 'Jordan', amount: 47.74 }
      ]
    },
    {
      id: 2,
      groupId: 1,
      transactionId: findTx('Grocery run'),
      splits: [
        { member: 'Alex', amount: 20.63 },
        { member: 'Sam', amount: 20.63 },
        { member: 'Jordan', amount: 20.64 }
      ]
    },
    {
      id: 3,
      groupId: 2,
      transactionId: findTx('Concert tickets'),
      splits: [
        { member: 'Alex', amount: 37.5 },
        { member: 'Priya', amount: 37.5 }
      ]
    }
  ];

  return {
    accounts,
    transactions,
    groups,
    groupTransactions,
    settings: {
      defaultAccountId: 'assets.bank_accounts.checkings',
      hasSeenWelcome: true,
      isDemoData: true
    }
  };
}
