import { render } from 'preact';
import { html } from 'htm/preact';
import { signal, computed } from '@preact/signals';
import { Dexie } from 'dexie';

// --- Database Setup ---
const db = new Dexie('BudgetCalculator');
db.version(1).stores({
  list: '++id, name, budget, expenses, moneySave, items, createdAt, lastModified',
});

// --- Signals ---
const budgetLists = signal([]);
const activeBudget = signal(null); // Selected budget
const isDrawerOpen = signal(false);
const isAddBudgetOpen = signal(false);

// Budget Form Inputs (Create / Edit)
const isEditingBudget = signal(false);
const budgetNameInput = signal('');
const budgetAmountInput = signal(0);

// Line Item Form Inputs (Add)
const newItemName = signal('');
const newItemAmount = signal('');

// Line Item Form Inputs (Edit Inline)
const editingItemId = signal(null);
const editItemName = signal('');
const editItemAmount = signal(0);

// Dynamic Total Dashboard Calculations
const overallBudget = computed(() =>
  budgetLists.value.reduce((acc, item) => acc + (Number(item.budget) || 0), 0)
);
const overallExpenses = computed(() =>
  budgetLists.value.reduce((acc, item) => acc + (Number(item.expenses) || 0), 0)
);
const overallSavings = computed(
  () => overallBudget.value - overallExpenses.value
);

// --- DB Operations ---
async function loadBudgets() {
  const data = await db.list.toArray();
  budgetLists.value = data;
}

async function createBudget() {
  if (!budgetNameInput.value.trim()) return;
  const now = new Date().toLocaleDateString();
  const newEntry = {
    name: budgetNameInput.value,
    budget: Number(budgetAmountInput.value) || 0,
    expenses: 0,
    moneySave: Number(budgetAmountInput.value) || 0,
    items: [],
    createdAt: now,
    lastModified: now,
  };
  await db.list.add(newEntry);
  budgetNameInput.value = '';
  budgetAmountInput.value = 0;
  isAddBudgetOpen.value = false;
  await loadBudgets();
}

async function updateBudget() {
  if (!activeBudget.value || !budgetNameInput.value.trim()) return;
  const current = activeBudget.value;
  const now = new Date().toLocaleDateString();
  const newBudgetVal = Number(budgetAmountInput.value) || 0;

  const updatedRecord = {
    ...current,
    name: budgetNameInput.value,
    budget: newBudgetVal,
    moneySave: newBudgetVal - current.expenses,
    lastModified: now,
  };

  await db.list.update(current.id, updatedRecord);
  activeBudget.value = updatedRecord;
  isEditingBudget.value = false;
  await loadBudgets();
}

async function deleteBudget(id, e) {
  if (e) e.stopPropagation();
  await db.list.delete(id);
  if (activeBudget.value?.id === id) {
    activeBudget.value = null;
    isDrawerOpen.value = false;
  }
  await loadBudgets();
}

async function addItemToBudget() {
  if (!activeBudget.value || !newItemName.value.trim()) return;

  const current = activeBudget.value;
  const itemCost = Number(newItemAmount.value) || 0;
  const updatedItems = [
    ...(current.items || []),
    { id: Date.now(), name: newItemName.value, value: itemCost },
  ];
  const newExpenses = updatedItems.reduce((sum, item) => sum + item.value, 0);
  const now = new Date().toLocaleDateString();

  const updatedRecord = {
    ...current,
    items: updatedItems,
    expenses: newExpenses,
    moneySave: current.budget - newExpenses,
    lastModified: now,
  };

  await db.list.update(current.id, updatedRecord);
  activeBudget.value = updatedRecord;
  newItemName.value = '';
  newItemAmount.value = '';
  await loadBudgets();
}

async function startEditItem(item) {
  editingItemId.value = item.id;
  editItemName.value = item.name;
  editItemAmount.value = item.value;
}

async function saveEditItem(itemId) {
  if (!activeBudget.value) return;
  const current = activeBudget.value;
  const updatedItems = current.items.map((i) =>
    i.id === itemId
      ? {
          ...i,
          name: editItemName.value,
          value: Number(editItemAmount.value) || 0,
        }
      : i
  );
  const newExpenses = updatedItems.reduce((sum, item) => sum + item.value, 0);
  const now = new Date().toLocaleDateString();

  const updatedRecord = {
    ...current,
    items: updatedItems,
    expenses: newExpenses,
    moneySave: current.budget - newExpenses,
    lastModified: now,
  };

  await db.list.update(current.id, updatedRecord);
  activeBudget.value = updatedRecord;
  editingItemId.value = null;
  await loadBudgets();
}

async function removeItemFromBudget(itemId) {
  if (!activeBudget.value) return;

  const current = activeBudget.value;
  const updatedItems = current.items.filter((item) => item.id !== itemId);
  const newExpenses = updatedItems.reduce((sum, item) => sum + item.value, 0);
  const now = new Date().toLocaleDateString();

  const updatedRecord = {
    ...current,
    items: updatedItems,
    expenses: newExpenses,
    moneySave: current.budget - newExpenses,
    lastModified: now,
  };

  await db.list.update(current.id, updatedRecord);
  activeBudget.value = updatedRecord;
  await loadBudgets();
}

// Initial Load
loadBudgets();

// --- Components ---

function BudgetCard({ item }) {
  const savings = item.budget - item.expenses;
  const isOverBudget = savings < 0;

  return html`
    <div
      class="card bg-base-100 shadow-sm hover:shadow-md transition-all cursor-pointer border border-base-200"
      onClick=${() => {
        activeBudget.value = item;
        isEditingBudget.value = false;
        isDrawerOpen.value = true;
      }}>
      <div class="card-body p-4 sm:p-5">
        <div class="flex justify-between items-start gap-2">
          <h2 class="card-title text-base sm:text-lg font-bold truncate">
          ${item.name}</h2>
          <button
            class="btn btn-ghost btn-xs btn-circle text-error shrink-0"
            onClick=${(e) => deleteBudget(item.id, e)}
            title="Delete Budget">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>

        <div class="grid grid-cols-2 gap-2 my-2 text-sm">
          <div class="p-2 bg-base-200 rounded-lg">
            <span class="text-xs text-base-content/60 block">Budget</span>
            <span class="font-bold text-primary">$${item.budget.toLocaleString()}</span>
          </div>
          <div class="p-2 bg-base-200 rounded-lg">
            <span class="text-xs text-base-content/60 block">Expenses</span>
            <span class="font-bold text-secondary">$${item.expenses.toLocaleString()}</span>
          </div>
        </div>

        <div class="flex justify-between items-center text-xs pt-1">
          <span class="text-base-content/70">Remaining:</span>
          <span class="font-bold ${
            isOverBudget ? 'text-error' : 'text-success'
          }">
            $${savings.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  `;
}

// Full Sheet on Mobile, Side Drawer on Desktop
function BudgetDetailView() {
  if (!isDrawerOpen.value || !activeBudget.value) return null;

  const item = activeBudget.value;
  const savings = item.budget - item.expenses;

  return html`
    <div class="fixed inset-0 z-50 flex justify-end">
      <!-- Backdrop (Fixed Form Cancel Warning by avoiding form submission backdrop) -->
      <div
        class="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick=${() => {
          isDrawerOpen.value = false;
          activeBudget.value = null;
        }}
      ></div>

      <!-- Drawer / Modal Sheet Content -->
      <div class="relative w-full md:w-[480px] lg:w-[560px] h-full bg-base-100 shadow-2xl flex flex-col z-10 transition-transform">
        <!-- Sticky Header -->
        <div class="p-4 border-b border-base-200 flex justify-between items-center bg-base-100">
          ${
            isEditingBudget.value
              ? html`
                <div class="flex items-center gap-2 flex-grow mr-2">
                  <input
                    type="text"
                    class="input input-bordered input-sm flex-grow"
                    value=${budgetNameInput.value}
                    onInput=${(e) => (budgetNameInput.value = e.target.value)}/>
                  <input
                    type="number"
                    class="input input-bordered input-sm w-24"
                    value=${budgetAmountInput.value}
                    onInput=${(e) =>
                      (budgetAmountInput.value = e.target.value)}/>
                  <button class="btn btn-success btn-xs" onClick=${updateBudget}>
                    <i class="fa-solid fa-check"></i>
                  </button>
                  <button class="btn btn-ghost btn-xs" onClick=${() =>
                    (isEditingBudget.value = false)}>
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                </div>
              `
              : html`
                <div class="flex items-center gap-2">
                  <h2 class="text-xl font-bold">${item.name}</h2>
                  <button
                    class="btn btn-ghost btn-xs btn-circle text-base-content/60"
                    onClick=${() => {
                      budgetNameInput.value = item.name;
                      budgetAmountInput.value = item.budget;
                      isEditingBudget.value = true;
                    }}
                    title="Edit Budget"
                  >
                    <i class="fa-solid fa-pen-to-square"></i>
                  </button>
                </div>
              `
          }
          <button
            class="btn btn-sm btn-circle btn-ghost"
            onClick=${() => {
              isDrawerOpen.value = false;
              activeBudget.value = null;
            }}
          >
            ✕
          </button>
        </div>

        <!-- Scrollable Content -->
        <div class="flex-grow overflow-y-auto p-4 space-y-4">
          <!-- Add Expense Input Bar -->
          <div class="card bg-base-200 p-3">
            <span class="text-xs font-semibold text-base-content/70 mb-2 block">Add New Expense Line</span>
            <div class="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Item name (e.g., Milk)"
                class="input input-bordered input-sm w-full"
                value=${newItemName.value}
                onInput=${(e) => (newItemName.value = e.target.value)}
              />
              <input
                type="number"
                placeholder="Amount ($)"
                class="input input-bordered input-sm w-full sm:w-28"
                value=${newItemAmount.value}
                onInput=${(e) => (newItemAmount.value = e.target.value)}
              />
              <button class="btn btn-primary btn-sm" onClick=${addItemToBudget}>
                <i class="fa-solid fa-plus"></i> Add
              </button>
            </div>
          </div>

          <!-- Line Items List -->
          <div class="space-y-2">
            <h3 class="text-sm font-semibold text-base-content/70">Expense Items</h3>
            ${
              !item.items || item.items.length === 0
                ? html`<p class="text-center text-base-content/50 py-8 text-sm">No expense items added yet.</p>`
                : html`
                  <div class="space-y-2">
                    ${item.items.map((expense) => {
                      const isEditingThis = editingItemId.value === expense.id;
                      return html`
                        <div key=${
                          expense.id
                        } class="p-3 bg-base-100 border border-base-200 rounded-lg flex items-center justify-between">
                          ${
                            isEditingThis
                              ? html`
                                <div class="flex items-center gap-2 w-full">
                                  <input
                                    type="text"
                                    class="input input-bordered input-xs flex-grow"
                                    value=${editItemName.value}
                                    onInput=${(e) =>
                                      (editItemName.value = e.target.value)}/>
                                  <input
                                    type="number"
                                    class="input input-bordered input-xs w-20"
                                    value=${editItemAmount.value}
                                    onInput=${(e) =>
                                      (editItemAmount.value = e.target.value)}/>
                                  <button
                                    class="btn btn-success btn-xs btn-square"
                                    onClick=${() => saveEditItem(expense.id)}>
                                    <i class="fa-solid fa-check"></i>
                                  </button>
                                  <button
                                    class="btn btn-ghost btn-xs btn-square"
                                    onClick=${() =>
                                      (editingItemId.value = null)} >
                                    <i class="fa-solid fa-xmark"></i>
                                  </button>
                                </div>
                              `
                              : html`
                                <span class="font-medium text-sm">
                                  ${expense.name}
                                </span>
                                <div class="flex items-center gap-2">
                                <span class="font-semibold text-sm text-secondary"> 
                                  $${expense.value.toLocaleString()}
                                </span>
                                  <button class="btn btn-ghost btn-xs btn-circle" onClick=${() =>
                                    startEditItem(expense)}>
                                    <i class="fa-solid fa-pencil"></i>
                                  </button>
                                  <button
                                    class="btn btn-ghost btn-xs btn-circle text-error"
                                    onClick=${() =>
                                      removeItemFromBudget(expense.id)}>
                                    <i class="fa-solid fa-trash-can"></i>
                                  </button>
                                </div>
                              `
                          }
                        </div>
                      `;
                    })}
                  </div>
                `
            }
          </div>
        </div>

        <!-- Sticky Footer Summary -->
        <div class="border-t border-base-200 p-4 bg-base-100 grid grid-cols-3 gap-2 text-center text-sm">
          <div>
            <span class="text-xs text-base-content/60 block">Budget</span>
            <span class="font-bold text-primary">$${item.budget.toLocaleString()}</span>
          </div>
          <div>
            <span class="text-xs text-base-content/60 block">Expenses</span>
            <span class="font-bold text-secondary">$${item.expenses.toLocaleString()}</span>
          </div>
          <div>
            <span class="text-xs text-base-content/60 block">Savings</span>
            <span class="font-bold ${
              savings < 0 ? 'text-error' : 'text-success'
            }">
              $${savings.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function CreateBudgetModal() {
  if (!isAddBudgetOpen.value) return null;

  return html`
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick=${() =>
        (isAddBudgetOpen.value = false)}></div>
      <div class="relative bg-base-100 rounded-xl p-6 w-full max-w-md shadow-xl z-10">
        <h3 class="font-bold text-lg mb-4 flex items-center gap-2">
          <i class="fa-solid fa-folder-plus text-primary"></i> Create New Budget
        </h3>
        <div class="space-y-3">
          <div class="form-control">
            <label class="label"><span class="label-text">Budget Name</span></label>
            <input
              type="text"
              placeholder="e.g. Monthly Groceries"
              class="input input-bordered w-full"
              value=${budgetNameInput.value}
              onInput=${(e) => (budgetNameInput.value = e.target.value)}
            />
          </div>
          <div class="form-control">
            <label class="label"><span class="label-text">Target Budget ($)</span></label>
            <input
              type="number"
              placeholder="500"
              class="input input-bordered w-full"
              value=${budgetAmountInput.value}
              onInput=${(e) => (budgetAmountInput.value = e.target.value)}
            />
          </div>
        </div>
        <div class="mt-6 flex justify-end gap-2">
          <button class="btn btn-ghost" onClick=${() =>
            (isAddBudgetOpen.value = false)}>Cancel</button>
          <button class="btn btn-primary" onClick=${createBudget}>Save</button>
        </div>
      </div>
    </div>
  `;
}

// --- Main App Component ---

function App() {
  return html`
    <div class="bg-base-200 h-dvh flex flex-col overflow-hidden">
      <!-- Navbar Header -->
      <header class="navbar bg-base-100 shadow-sm z-10 px-4 flex justify-between">
        <div class="flex items-center gap-3">
          <i class="fa-solid fa-calculator text-2xl text-primary"></i>
          <h1 class="text-xl font-bold tracking-tight">Budget Calculator</h1>
        </div>
        <!-- Single Primary Add Button -->
        <button
          class="btn btn-primary btn-sm gap-2"
          onClick=${() => {
            budgetNameInput.value = '';
            budgetAmountInput.value = 0;
            isAddBudgetOpen.value = true;
          }}
        >
          <i class="fa-solid fa-plus"></i>
          <span>New Budget</span>
        </button>
      </header>

      <!-- Scrollable Main Container -->
      <main class="flex-grow overflow-y-auto p-4 md:p-6">
        ${
          budgetLists.value.length === 0
            ? html`
              <div class="h-full flex flex-col items-center justify-center text-center text-base-content/60">
                <i class="fa-solid fa-receipt text-5xl mb-3 text-base-300"></i>
                <p class="text-lg font-medium">No budgets created yet.</p>
                <p class="text-sm">Click "+ New Budget" in the top bar to get started.</p>
              </div>
            `
            : html`
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-7xl mx-auto">
                ${budgetLists.value.map(
                  (item) => html`<${BudgetCard} key=${item.id} item=${item} />`
                )}
              </div>
            `
        }
      </main>

      <!-- Dashboard Footer Summary -->
      <footer class="bg-base-100 border-t border-base-200 p-4 shadow-md">
        <div class="max-w-7xl mx-auto grid grid-cols-3 gap-4 text-center">
          <div>
            <span class="text-xs text-base-content/60 block">Overall Budget</span>
            <span class="font-bold text-primary text-sm sm:text-base">
              $${overallBudget.value.toLocaleString()}
            </span>
          </div>
          <div>
            <span class="text-xs text-base-content/60 block">Overall Expenses</span>
            <span class="font-bold text-secondary text-sm sm:text-base">
              $${overallExpenses.value.toLocaleString()}
            </span>
          </div>
          <div>
            <span class="text-xs text-base-content/60 block">Overall Savings</span>
            <span
              class="font-bold ${
                overallSavings.value < 0 ? 'text-error' : 'text-success'
              } text-sm sm:text-base"
            >
              $${overallSavings.value.toLocaleString()}
            </span>
          </div>
        </div>
      </footer>

      <!-- Modals and Drawers -->
      <${BudgetDetailView} />
      <${CreateBudgetModal} />
    </div>
  `;
}

render(html`<${App} />`, document.getElementById('app'));
