import { DialogComponent, DialogOpenEvent } from '@theme/dialog';
import { CartAddEvent } from '@theme/events';

/**
 * A custom element that manages a cart drawer.
 *
 * @typedef {object} Refs
 * @property {HTMLDialogElement} dialog - The dialog element.
 *
 * @extends {DialogComponent}
 */
class CartDrawerComponent extends DialogComponent {
  /** @type {number} */
  #summaryThreshold = 0.5;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(CartAddEvent.eventName, this.#handleCartAdd);
    this.addEventListener(DialogOpenEvent.eventName, this.#updateStickyState);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(CartAddEvent.eventName, this.#handleCartAdd);
    this.removeEventListener(DialogOpenEvent.eventName, this.#updateStickyState);
  }

  #handleCartAdd = () => {
    if (this.hasAttribute('auto-open')) {
      this.showDialog();
    }
  };

  open() {
    this.showDialog();

    /**
     * Close cart drawer when installments CTA is clicked to avoid overlapping dialogs
     */
    customElements.whenDefined('shopify-payment-terms').then(() => {
      const installmentsContent = document.querySelector('shopify-payment-terms')?.shadowRoot;
      const cta = installmentsContent?.querySelector('#shopify-installments-cta');
      cta?.addEventListener('click', this.closeDialog, { once: true });
    });
  }

  close() {
    this.closeDialog();
  }

  #updateStickyState() {
    const { dialog } = /** @type {Refs} */ (this.refs);
    if (!dialog) return;

    // Refs do not cross nested `*-component` boundaries (e.g., `cart-items-component`), so we query within the dialog.
    const content = dialog.querySelector('.cart-drawer__content');
    const summary = dialog.querySelector('.cart-drawer__summary');

    if (!content || !summary) {
      // Ensure the dialog doesn't get stuck in "unsticky" mode when summary disappears (e.g., empty cart).
      dialog.setAttribute('cart-summary-sticky', 'false');
      return;
    }

    const drawerHeight = dialog.getBoundingClientRect().height;
    const summaryHeight = summary.getBoundingClientRect().height;
    const ratio = summaryHeight / drawerHeight;
    dialog.setAttribute('cart-summary-sticky', ratio > this.#summaryThreshold ? 'false' : 'true');
  }
}

if (!customElements.get('cart-drawer-component')) {
  customElements.define('cart-drawer-component', CartDrawerComponent);
}

// Upsell add-to-cart (AJAX, cart-drawer compatible)
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.upsell-add-to-cart');
  if (!btn) return;

  e.preventDefault();

  // prevent double click
  if (btn.disabled) return;

  const originalText = btn.textContent;

  btn.textContent = 'Adding…';
  btn.disabled = true;

  try {
    const response = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: btn.dataset.variantId,
        quantity: 1
      })
    });

    if (response.ok) {
      document.dispatchEvent(new CartAddEvent());

      // ✅ Success state
      btn.textContent = 'Added';
      btn.classList.add('is-added');

      // Optional: reset back after a delay
      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('is-added');
        btn.disabled = false;
      }, 2000);
    } else {
      throw new Error('Add failed');
    }
  } catch (error) {
    console.error('Upsell add failed', error);
    btn.textContent = 'Try again';
    btn.disabled = false;
  }
});

