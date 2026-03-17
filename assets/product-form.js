/**
 * ============================================
 * CHANGELOG — product-form.js
 * ============================================
 *
 * [2026-03-17] — Buy Now Button
 *   - Added #initializeBuyNow() method to ProductFormComponent
 *   - Listens for clicks on [data-buy-now="true"] button
 *   - Sets _isBuyNow flag and triggers form submit programmatically
 *   - On successful cart add (standard path), checks _isBuyNow → redirects to /checkout
 *   - On successful cart add (multi-item path — Buy 2 offer / warranty), same redirect logic
 *   - Resets _isBuyNow flag on errors (quantity validation, multi-item catch block)
 *   - Requires companion Liquid: Buy Now button with data-buy-now="true" in buy-buttons.liquid
 *
 * [Previous] — Buy 2 Offer + Warranty
 *   - Added #initializeBuy2Offer() — checkbox-driven variant picker for buy-2 deals
 *   - Added #initializeWarranty() — checkbox-driven warranty product add-on
 *   - Added #handleMultiItemSubmit() — batches offer + warranty items via /cart/add.js
 *   - Added #getBuy2OfferItems() and #getWarrantyItems() helpers
 *   - Cached DOM elements in #cachedElements for performance
 *
 * ============================================
 */


import { Component } from '@theme/component';
import { fetchConfig, preloadImage, onAnimationEnd, yieldToMainThread } from '@theme/utilities';
import { ThemeEvents, CartAddEvent, CartErrorEvent, CartUpdateEvent, VariantUpdateEvent } from '@theme/events';
import { cartPerformance } from '@theme/performance';
import { morph } from '@theme/morph';

// Error message display duration - gives users time to read the message
const ERROR_MESSAGE_DISPLAY_DURATION = 10000;

// Button re-enable delay after error - prevents rapid repeat attempts
const ERROR_BUTTON_REENABLE_DELAY = 1000;

// Success message display duration for screen readers
const SUCCESS_MESSAGE_DISPLAY_DURATION = 5000;

/**
 * @typedef {HTMLElement & {
 *   source: Element,
 *   destination: Element,
 *   useSourceSize: string | boolean
 * }} FlyToCart
 */

/**
 * A custom element that manages an add to cart button.
 *
 * @typedef {object} AddToCartRefs
 * @property {HTMLButtonElement} addToCartButton - The add to cart button.
 * @extends Component<AddToCartRefs>
 */
export class AddToCartComponent extends Component {
  requiredRefs = ['addToCartButton'];

  /** @type {number[] | undefined} */
  #resetTimeouts = /** @type {number[]} */ ([]);

  connectedCallback() {
    super.connectedCallback();

    this.addEventListener('pointerenter', this.#preloadImage, { passive: true });
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    if (this.#resetTimeouts) {
      this.#resetTimeouts.forEach(/** @param {number} timeoutId */ (timeoutId) => clearTimeout(timeoutId));
    }
    this.removeEventListener('pointerenter', this.#preloadImage);
  }

  /**
   * Disables the add to cart button.
   */
  disable() {
    this.refs.addToCartButton.disabled = true;
  }

  /**
   * Enables the add to cart button.
   */
  enable() {
    this.refs.addToCartButton.disabled = false;
  }

  /**
   * Handles the click event for the add to cart button.
   * @param {MouseEvent & {target: HTMLElement}} event - The click event.
   */
  handleClick(event) {
    const form = this.closest('form');
    if (!form?.checkValidity()) return;

    // Check if adding would exceed max before animating
    const productForm = /** @type {ProductFormComponent | null} */ (this.closest('product-form-component'));
    const quantitySelector = productForm?.refs.quantitySelector;
    if (quantitySelector?.canAddToCart) {
      const validation = quantitySelector.canAddToCart();
      // Don't animate if it would exceed max
      if (!validation.canAdd) {
        return;
      }
    }
    if (this.refs.addToCartButton.dataset.puppet !== 'true') {
      const animationEnabled = this.dataset.addToCartAnimation === 'true';
      if (animationEnabled && !event.target.closest('.quick-add-modal')) {
        this.#animateFlyToCart();
      }
      this.animateAddToCart();
    }
  }

  #preloadImage = () => {
    const image = this.dataset.productVariantMedia;

    if (!image) return;

    preloadImage(image);
  };

  /**
   * Animates the fly to cart animation.
   */
  #animateFlyToCart() {
    const { addToCartButton } = this.refs;
    const cartIcon = document.querySelector('.header-actions__cart-icon');

    const image = this.dataset.productVariantMedia;

    if (!cartIcon || !addToCartButton || !image) return;

    const flyToCartElement = /** @type {FlyToCart} */ (document.createElement('fly-to-cart'));

    let flyToCartClass = addToCartButton.classList.contains('quick-add__button')
      ? 'fly-to-cart--quick'
      : 'fly-to-cart--main';

    flyToCartElement.classList.add(flyToCartClass);
    flyToCartElement.style.setProperty('background-image', `url(${image})`);
    flyToCartElement.style.setProperty('--start-opacity', '0');
    flyToCartElement.source = addToCartButton;
    flyToCartElement.destination = cartIcon;

    document.body.appendChild(flyToCartElement);
  }

  /**
   * Animates the add to cart button.
   */
  animateAddToCart = async function () {
    const { addToCartButton } = this.refs;

    // Initialize the array if it doesn't exist
    if (!this.#resetTimeouts) {
      this.#resetTimeouts = [];
    }

    // Clear all existing timeouts
    this.#resetTimeouts.forEach(/** @param {number} timeoutId */ (timeoutId) => clearTimeout(timeoutId));
    this.#resetTimeouts = [];

    if (addToCartButton.dataset.added !== 'true') {
      addToCartButton.dataset.added = 'true';
    }

    // The onAnimationEnd can trigger a style recalculation so we yield to the main thread first.
    await yieldToMainThread();
    await onAnimationEnd(addToCartButton);

    // Create new timeout and store it in the array
    const timeoutId = setTimeout(() => {
      addToCartButton.removeAttribute('data-added');

      // Remove this timeout from the array
      const index = this.#resetTimeouts.indexOf(timeoutId);
      if (index > -1) {
        this.#resetTimeouts.splice(index, 1);
      }
    }, 800);

    this.#resetTimeouts.push(timeoutId);
  };
}

if (!customElements.get('add-to-cart-component')) {
  customElements.define('add-to-cart-component', AddToCartComponent);
}

/**
 * A custom element that manages a product form.
 *
 * @typedef {{items: Array<{quantity: number, variant_id: number}>}} Cart
 *
 * @typedef {object} ProductFormRefs
 * @property {HTMLInputElement} variantId - The form input for submitting the variant ID.
 * @property {AddToCartComponent | undefined} addToCartButtonContainer - The add to cart button container element.
 * @property {HTMLElement | undefined} addToCartTextError - The add to cart text error.
 * @property {HTMLElement | undefined} acceleratedCheckoutButtonContainer - The accelerated checkout button container element.
 * @property {HTMLElement} liveRegion - The live region.
 * @property {HTMLElement | undefined} quantityLabelCartCount - The quantity label cart count element.
 * @property {HTMLElement | undefined} quantityRules - The quantity rules element.
 * @property {HTMLElement | undefined} productFormButtons - The product form buttons container.
 * @property {HTMLElement | undefined} volumePricing - The volume pricing component.
 * @property {any | undefined} quantitySelector - The quantity selector component.
 * @property {HTMLElement | undefined} quantitySelectorWrapper - The quantity selector wrapper element.
 * @property {HTMLElement | undefined} quantityLabel - The quantity label element.
 * @property {HTMLElement | undefined} pricePerItem - The price per item component.
 *
 * @extends Component<ProductFormRefs>
 */
class ProductFormComponent extends Component {
  requiredRefs = ['variantId', 'liveRegion'];
  #abortController = new AbortController();
  /** @type {AbortController | null} */
  #atcFetchController = null;

  /** @type {number | undefined} */
  #timeout;

  // Cache DOM queries
  #cachedElements = {
    variantsContainer: null,
    cards: null,
    selectedText: null,
    offerCheckbox: null,
    warrantyCheckboxes: null,
    form: null
  };

  connectedCallback() {
    super.connectedCallback();

    const { signal } = this.#abortController;
    const target = this.closest('.shopify-section, dialog, product-card');
    target?.addEventListener(ThemeEvents.variantUpdate, this.#onVariantUpdate, { signal });
    target?.addEventListener(ThemeEvents.variantSelected, this.#onVariantSelected, { signal });

    // Listen for cart updates to sync data-cart-quantity
    document.addEventListener(ThemeEvents.cartUpdate, this.#onCartUpdate, { signal });
    
    // Cache form element
    this.#cachedElements.form = this.querySelector('form');
    
    // Initialize Buy 2 Offer functionality
    this.#initializeBuy2Offer();
    
    // Initialize Warranty functionality
    this.#initializeWarranty();
    // Initialize Buy Now button
this.#initializeBuyNow();
}

/**
 * Initialize Buy Now button — direct checkout, bypasses cart drawer
 */
#initializeBuyNow() {
  const buyNowBtn = this.querySelector('[data-buy-now="true"]');
  if (!buyNowBtn) return;

  buyNowBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    
    // Prevent double-clicks
    buyNowBtn.disabled = true;

    // Check for Buy 2 offer and warranty items
    const offerItems = this.#getBuy2OfferItems();
    const warrantyItems = this.#getWarrantyItems();

    let itemsToAdd;

    if (offerItems || warrantyItems.length > 0) {
      // Multi-item: offer + warranty
      itemsToAdd = [];
      if (offerItems) {
        itemsToAdd.push(...offerItems);
      } else {
        const variantId = this.refs.variantId.value;
        const form = this.#cachedElements.form;
        const formData = new FormData(form);
        const quantity = formData.get('quantity') || this.dataset.quantityDefault || '1';
        if (variantId) {
          itemsToAdd.push({ id: variantId, quantity: parseInt(quantity) });
        }
      }
      if (warrantyItems.length > 0) {
        itemsToAdd.push(...warrantyItems);
      }
    } else {
      // Standard single item
      const variantId = this.refs.variantId.value;
      const form = this.#cachedElements.form;
      const formData = new FormData(form);
      const quantity = formData.get('quantity') || this.dataset.quantityDefault || '1';
      itemsToAdd = [{ id: variantId, quantity: parseInt(quantity) }];
    }

    try {
      await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToAdd })
      });
      // Go straight to checkout — no CartAddEvent, no drawer
      window.location.href = '/checkout';
    } catch (error) {
      console.error('Buy Now error:', error);
      buyNowBtn.disabled = false;
    }
  });
}

  disconnectedCallback() {
    super.disconnectedCallback();

    this.#abortController.abort();
    
    // Clear cached elements
    this.#cachedElements = {
      variantsContainer: null,
      cards: null,
      selectedText: null,
      offerCheckbox: null,
      warrantyCheckboxes: null,
      form: null
    };
  }

  /**
   * Initialize Buy 2 Offer widget - OPTIMIZED
   */
  #initializeBuy2Offer() {
    const offerCheckbox = this.querySelector('#offer-checkbox');
    
    if (!offerCheckbox) return;

    // Cache DOM elements
    this.#cachedElements.offerCheckbox = offerCheckbox;
    this.#cachedElements.variantsContainer = this.querySelector('.buy-2-variants');
    this.#cachedElements.cards = this.querySelectorAll('.variant-card');
    this.#cachedElements.selectedText = this.querySelector('#selectedVariantsText');

    const { variantsContainer, cards, selectedText } = this.#cachedElements;

    let selectedVariants = [];

    // Checkbox toggle handler
    offerCheckbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        if (variantsContainer) {
          variantsContainer.classList.add('active-s');
        }
        
        // Initialize first AVAILABLE variant if nothing selected
        if (selectedVariants.length === 0 && cards && cards.length) {
          const firstAvailable = Array.from(cards).find(card => !card.classList.contains('sold_out'));
          if (firstAvailable) {
            firstAvailable.classList.add('active');
            selectedVariants = [{
              id: firstAvailable.dataset.variantId,
              title: firstAvailable.dataset.variantTitle,
              el: firstAvailable
            }];
            this.#updateSelectedText(selectedText, selectedVariants);
          }
        }
      } else {
        if (variantsContainer) {
          variantsContainer.classList.remove('active-s');
        }
      }
    }, { passive: true });

    // Use event delegation for better performance
    if (cards && cards.length) {
      const clickHandler = (e) => {
        const card = e.target.closest('.variant-card');
        if (!card) return;

        // Only allow selection if checkbox is checked
        if (!offerCheckbox.checked) return;
        
        // Prevent selection of sold out variants
        if (card.classList.contains('sold_out')) return;

        const id = card.dataset.variantId;
        const title = card.dataset.variantTitle;
        const index = selectedVariants.findIndex(v => v.id === id);

        // Already selected → remove
        if (index > -1) {
          if (selectedVariants.length === 1) return; // Keep at least 1 selected
          selectedVariants.splice(index, 1);
          card.classList.remove('active');
        }
        // New selection
        else {
          // If already 2 → remove first automatically
          if (selectedVariants.length >= 2) {
            const removed = selectedVariants.shift();
            removed.el.classList.remove('active');
          }
          card.classList.add('active');
          selectedVariants.push({ id, title, el: card });
        }

        this.#updateSelectedText(selectedText, selectedVariants);
      };

      // Add single delegated listener instead of multiple
      const parentContainer = cards[0].parentElement;
      if (parentContainer) {
        parentContainer.addEventListener('click', clickHandler);
      }
    }

    // Store reference for use in handleSubmit
    this.offerData = {
      checkbox: offerCheckbox,
      getSelectedVariants: () => selectedVariants
    };
  }

  /**
   * Initialize Warranty widget - OPTIMIZED
   */
  #initializeWarranty() {
    const warrantyCheckboxes = this.querySelectorAll('.warranty-checkbox');
    
    if (!warrantyCheckboxes.length) return;

    // Cache checkboxes
    this.#cachedElements.warrantyCheckboxes = warrantyCheckboxes;

    // Store reference for use in handleSubmit
    this.warrantyData = {
      getSelectedWarranties: () => {
        const selected = [];
        const checkboxes = this.#cachedElements.warrantyCheckboxes;
        
        if (!checkboxes) return selected;
        
        for (const checkbox of checkboxes) {
          if (checkbox.checked) {
            const variantId = checkbox.dataset.warrantyVariant;
            if (variantId) {
              selected.push({ id: variantId, quantity: 1 });
            }
          }
        }
        return selected;
      }
    };
  }

  /**
   * Update selected variants text display - OPTIMIZED
   */
  #updateSelectedText(selectedText, selectedVariants) {
    if (!selectedText) return;
    
    if (selectedVariants.length === 1) {
      // Show the same variant twice in order
      selectedText.textContent = `${selectedVariants[0].title} , ${selectedVariants[0].title}`;
    } else {
      // Show variants in the order they were selected (first selected, second selected)
      selectedText.textContent = `${selectedVariants[0].title} , ${selectedVariants[1].title}`;
    }
  }

  /**
   * Get Buy 2 offer items to add to cart
   * @returns {Array<{id: string, quantity: number}> | null}
   */
  #getBuy2OfferItems() {
    const checkbox = this.#cachedElements.offerCheckbox;
    if (!checkbox?.checked) return null;

    const selectedVariants = this.offerData.getSelectedVariants();
    
    // If no variants exist (no variant cards), use the main product variant with quantity 2
    if (selectedVariants.length === 0) {
      const variantIdInput = this.refs.variantId;
      if (variantIdInput?.value) {
        return [{ id: variantIdInput.value, quantity: 2 }];
      }
      return null;
    }
    
    if (selectedVariants.length === 1) {
      return [{ id: selectedVariants[0].id, quantity: 2 }];
    } else {
      return selectedVariants.map(v => ({ id: v.id, quantity: 1 }));
    }
  }

  /**
   * Get warranty items to add to cart
   * @returns {Array<{id: string, quantity: number}>}
   */
  #getWarrantyItems() {
    if (!this.warrantyData) return [];
    return this.warrantyData.getSelectedWarranties();
  }

  /**
   * Updates quantity selector with cart data for current variant
   * @param {Cart} cart - The cart object with items array
   * @returns {number} The cart quantity for the current variant
   */
  #updateCartQuantityFromData(cart) {
    const variantIdInput = this.refs.variantId;
    if (!variantIdInput?.value || !cart?.items) return 0;

    const variantIdValue = variantIdInput.value;
    const cartItem = cart.items.find((item) => item.variant_id.toString() === variantIdValue);
    const cartQty = cartItem ? cartItem.quantity : 0;

    // Use public API to update quantity selector
    const quantitySelector = this.refs.quantitySelector;
    if (quantitySelector?.setCartQuantity) {
      quantitySelector.setCartQuantity(cartQty);
    }

    // Update quantity label if it exists
    this.#updateQuantityLabel(cartQty);

    return cartQty;
  }

  /**
   * Fetches cart and updates quantity selector for current variant
   * @returns {Promise<number>} The cart quantity for the current variant
   */
  async #fetchAndUpdateCartQuantity() {
    const variantIdInput = this.refs.variantId;
    if (!variantIdInput?.value) return 0;

    try {
      const response = await fetch('/cart.js');
      const cart = await response.json();

      return this.#updateCartQuantityFromData(cart);
    } catch (error) {
      console.error('Failed to fetch cart quantity:', error);
      return 0;
    }
  }

  /**
   * Updates data-cart-quantity when cart is updated from elsewhere
   * @param {CartUpdateEvent|CartAddEvent} event
   */
  #onCartUpdate = async (event) => {
    // Skip if this event came from this component
    if (event.detail?.sourceId === this.id || event.detail?.data?.source === 'product-form-component') return;

    const cart = /** @type {Cart} */ (event.detail?.resource);
    if (cart?.items) {
      this.#updateCartQuantityFromData(cart);
    } else {
      await this.#fetchAndUpdateCartQuantity();
    }
  };

  /**
   * Handles the submit event for the product form - OPTIMIZED
   *
   * @param {Event} event - The submit event.
   */
  async handleSubmit(event) {
    const { addToCartTextError } = this.refs;
    // Stop default behaviour from the browser
    event.preventDefault();

    if (this.#timeout) clearTimeout(this.#timeout);

    // Query for ALL add-to-cart components
    const allAddToCartContainers = /** @type {NodeListOf<AddToCartComponent>} */ (
      this.querySelectorAll('add-to-cart-component')
    );

    // Check if ANY add to cart button is disabled and do an early return if it is
    const anyButtonDisabled = Array.from(allAddToCartContainers).some(
      (container) => container.refs.addToCartButton?.disabled
    );
    if (anyButtonDisabled) return;

    // Use cached form element
    const form = this.#cachedElements.form;
    if (!form) throw new Error('Product form element missing');

    // Check for Buy 2 offer
    const offerItems = this.#getBuy2OfferItems();
    
    // Get warranty items
    const warrantyItems = this.#getWarrantyItems();
    
    if (offerItems || warrantyItems.length > 0) {
      // Handle Buy 2 offer and/or warranty submission
      await this.#handleMultiItemSubmit(event, offerItems, warrantyItems, allAddToCartContainers);
      return;
    }

    // Standard single item submission
    if (this.refs.quantitySelector?.canAddToCart) {
      const validation = this.refs.quantitySelector.canAddToCart();

      if (!validation.canAdd) {
        // Disable ALL add-to-cart buttons
        for (const container of allAddToCartContainers) {
          container.disable();
        }

        const errorTemplate = this.dataset.quantityErrorMax || '';
        const errorMessage = errorTemplate.replace('{{ maximum }}', validation.maxQuantity?.toString() || '');
        if (addToCartTextError) {
          addToCartTextError.classList.remove('hidden');

          const textNode = addToCartTextError.childNodes[2];
          if (textNode) {
            textNode.textContent = errorMessage;
          } else {
            const newTextNode = document.createTextNode(errorMessage);
            addToCartTextError.appendChild(newTextNode);
          }

          this.#setLiveRegionText(errorMessage);

          if (this.#timeout) clearTimeout(this.#timeout);
          this.#timeout = setTimeout(() => {
            if (!addToCartTextError) return;
            addToCartTextError.classList.add('hidden');
            this.#clearLiveRegionText();
          }, ERROR_MESSAGE_DISPLAY_DURATION);
        }
this._isBuyNow = false;
        setTimeout(() => {
          // Re-enable ALL add-to-cart buttons
          for (const container of allAddToCartContainers) {
            container.enable();
          }
        }, ERROR_BUTTON_REENABLE_DELAY);

        return;
      }
    }

    const formData = new FormData(form);

    // Optimize section collection
    const cartItemsComponents = document.querySelectorAll('cart-items-component');
    const cartItemComponentsSectionIds = [];
    
    for (const item of cartItemsComponents) {
      if (item instanceof HTMLElement && item.dataset.sectionId) {
        cartItemComponentsSectionIds.push(item.dataset.sectionId);
      }
    }
    
    if (cartItemComponentsSectionIds.length) {
      formData.append('sections', cartItemComponentsSectionIds.join(','));
    }

    const fetchCfg = fetchConfig('javascript', { body: formData });

    // Abort any previous in-flight ATC request before starting a new one
    if (this.#atcFetchController) this.#atcFetchController.abort();
    this.#atcFetchController = new AbortController();

    fetch(Theme.routes.cart_add_url, {
      ...fetchCfg,
      headers: {
        ...fetchCfg.headers,
        Accept: 'text/html',
      },
      signal: this.#atcFetchController.signal,
    })
      .then((response) => response.json())
      .then(async (response) => {
        if (response.status) {
          this.dispatchEvent(
            new CartErrorEvent(form.getAttribute('id') || '', response.message, response.description, response.errors)
          );

          if (!addToCartTextError) return;
          addToCartTextError.classList.remove('hidden');

          // Reuse the text node if the user is spam-clicking
          const textNode = addToCartTextError.childNodes[2];
          if (textNode) {
            textNode.textContent = response.message;
          } else {
            const newTextNode = document.createTextNode(response.message);
            addToCartTextError.appendChild(newTextNode);
          }

          // Create or get existing error live region for screen readers
          this.#setLiveRegionText(response.message);

          this.#timeout = setTimeout(() => {
            if (!addToCartTextError) return;
            addToCartTextError.classList.add('hidden');

            // Clear the announcement
            this.#clearLiveRegionText();
          }, ERROR_MESSAGE_DISPLAY_DURATION);

          // When we add more than the maximum amount of items to the cart, we need to dispatch a cart update event
          // because our back-end still adds the max allowed amount to the cart.
          this.dispatchEvent(
            new CartAddEvent({}, this.id, {
              didError: true,
              source: 'product-form-component',
              itemCount: Number(formData.get('quantity')) || Number(this.dataset.quantityDefault),
              productId: this.dataset.productId,
            })
          );

          return;
        } else {
          const id = formData.get('id');

          if (addToCartTextError) {
            addToCartTextError.classList.add('hidden');
            addToCartTextError.removeAttribute('aria-live');
          }

          if (!id) throw new Error('Form ID is required');

          // Add aria-live region to inform screen readers that the item was added
          // Get the added text from any add-to-cart button
          const anyAddToCartButton = allAddToCartContainers[0]?.refs.addToCartButton;
          if (anyAddToCartButton) {
            const addedTextElement = anyAddToCartButton.querySelector('.add-to-cart-text--added');
            const addedText = addedTextElement?.textContent?.trim() || Theme.translations.added;

            this.#setLiveRegionText(addedText);

            setTimeout(() => {
              this.#clearLiveRegionText();
            }, SUCCESS_MESSAGE_DISPLAY_DURATION);
          }

          // Dispatch cart event immediately so the cart drawer opens without waiting
          // for the quantity sync. The quantity sync runs in the background after.
          this.dispatchEvent(
            new CartAddEvent({}, id.toString(), {
              source: 'product-form-component',
              itemCount: Number(formData.get('quantity')) || Number(this.dataset.quantityDefault),
              productId: this.dataset.productId,
              sections: response.sections,
            })
          );

          // Sync the PDP quantity counter in background — does not block cart opening
          this.#fetchAndUpdateCartQuantity();
          if (this._isBuyNow) {
  this._isBuyNow = false;
  window.location.href = '/checkout';
  return;
}
        }
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') console.error(error);
      })
      .finally(() => {
        this.#atcFetchController = null;
        cartPerformance.measureFromEvent('add:user-action', event);
      });
  }

  /**
   * Handle Buy 2 Offer and/or Warranty submission - OPTIMIZED
   */
  async #handleMultiItemSubmit(event, offerItems, warrantyItems, allAddToCartContainers) {
    const { addToCartTextError } = this.refs;

    // Combine offer items and warranty items
    let itemsToAdd = [];
    
    if (offerItems) {
      itemsToAdd = [...offerItems];
    } else {
      // If no offer, add the standard product
      const variantId = this.refs.variantId.value;
      const form = this.#cachedElements.form;
      const formData = new FormData(form);
      const quantity = formData.get('quantity') || this.dataset.quantityDefault || '1';
      if (variantId) {
        itemsToAdd.push({ id: variantId.toString(), quantity: parseInt(quantity) });
      }
    }
    
    // Add warranty items
    if (warrantyItems.length > 0) {
      itemsToAdd.push(...warrantyItems);
    }

    // Get sections to update - optimized
    const cartItemsComponents = document.querySelectorAll('cart-items-component');
    const sectionIds = [];
    for (const item of cartItemsComponents) {
      if (item instanceof HTMLElement && item.dataset.sectionId) {
        sectionIds.push(item.dataset.sectionId);
      }
    }
    const sections = sectionIds.join(',');

    try {
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          items: itemsToAdd,
          sections: sections || undefined
        })
      });

      const data = await response.json();

      if (data.status) {
        // Error occurred
        this.dispatchEvent(
          new CartErrorEvent('', data.message, data.description, data.errors || {})
        );

        if (addToCartTextError) {
          addToCartTextError.classList.remove('hidden');
          const textNode = addToCartTextError.childNodes[2];
          if (textNode) {
            textNode.textContent = data.message;
          } else {
            addToCartTextError.appendChild(document.createTextNode(data.message));
          }

          this.#setLiveRegionText(data.message);

          this.#timeout = setTimeout(() => {
            if (!addToCartTextError) return;
            addToCartTextError.classList.add('hidden');
            this.#clearLiveRegionText();
          }, ERROR_MESSAGE_DISPLAY_DURATION);
        }
      } else {
        // Success
        if (addToCartTextError) {
          addToCartTextError.classList.add('hidden');
        }

        // Announce success to screen readers
        const anyAddToCartButton = allAddToCartContainers[0]?.refs.addToCartButton;
        if (anyAddToCartButton) {
          const addedTextElement = anyAddToCartButton.querySelector('.add-to-cart-text--added');
          const addedText = addedTextElement?.textContent?.trim() || Theme.translations.added;

          this.#setLiveRegionText(addedText);

          setTimeout(() => {
            this.#clearLiveRegionText();
          }, SUCCESS_MESSAGE_DISPLAY_DURATION);
        }

        // Fetch updated cart quantity
        await this.#fetchAndUpdateCartQuantity();

        // Calculate total item count
        const totalItemCount = itemsToAdd.reduce((sum, item) => sum + item.quantity, 0);

        // Dispatch cart add event
        this.dispatchEvent(
          new CartAddEvent({}, itemsToAdd[0].id.toString(), {
            source: 'product-form-component',
            itemCount: totalItemCount,
            productId: this.dataset.productId,
            sections: data.sections,
          })
        );

        // Trigger add to cart animation
        for (const container of allAddToCartContainers) {
          if (container.animateAddToCart) {
            container.animateAddToCart();
          }
        }
        if (this._isBuyNow) {
  this._isBuyNow = false;
  window.location.href = '/checkout';
  return;
}
      }
    } catch (error) {
      console.error('Multi-item add to cart error:', error);
            this._isBuyNow = false;

      if (addToCartTextError) {
        addToCartTextError.classList.remove('hidden');
        const errorMsg = 'Failed to add items to cart';
        const textNode = addToCartTextError.childNodes[2];
        if (textNode) {
          textNode.textContent = errorMsg;
        } else {
          addToCartTextError.appendChild(document.createTextNode(errorMsg));
        }
      }
    } finally {
      cartPerformance.measureFromEvent('add:user-action', event);
    }
  }

  /**
   * Updates the quantity label with the current cart quantity
   * @param {number} cartQty - The quantity in cart
   */
  #updateQuantityLabel(cartQty) {
    const quantityLabel = this.refs.quantityLabelCartCount;
    if (quantityLabel) {
      const inCartText = quantityLabel.textContent?.match(/\((\d+)\s+(.+)\)/);
      if (inCartText && inCartText[2]) {
        quantityLabel.textContent = `(${cartQty} ${inCartText[2]})`;
      }

      // Show/hide based on quantity
      quantityLabel.classList.toggle('hidden', cartQty === 0);
    }
  }

  /**
   * @param {*} text
   */
  #setLiveRegionText(text) {
    const liveRegion = this.refs.liveRegion;
    liveRegion.textContent = text;
  }

  #clearLiveRegionText() {
    const liveRegion = this.refs.liveRegion;
    liveRegion.textContent = '';
  }

  /**
   * Morphs or removes/adds an element based on current and new element states
   * @param {Element | null | undefined} currentElement - The current element in the DOM
   * @param {Element | null | undefined} newElement - The new element from the server response
   * @param {Element | null} [insertReferenceElement] - Element to insert before if adding new element
   */
  #morphOrUpdateElement(currentElement, newElement, insertReferenceElement = null) {
    if (currentElement && newElement) {
      morph(currentElement, newElement);
    } else if (currentElement && !newElement) {
      currentElement.remove();
    } else if (!currentElement && newElement && insertReferenceElement) {
      insertReferenceElement.insertAdjacentElement('beforebegin', /** @type {Element} */ (newElement.cloneNode(true)));
    }
  }

  /**
   * @param {VariantUpdateEvent} event
   */
  #onVariantUpdate = async (event) => {
    if (event.detail.data.newProduct) {
      this.dataset.productId = event.detail.data.newProduct.id;
    } else if (event.detail.data.productId !== this.dataset.productId) {
      return;
    }

    const { variantId } = this.refs;

    // Update the variant ID
    variantId.value = event.detail.resource?.id ?? '';
    const { addToCartButtonContainer: currentAddToCartButtonContainer, acceleratedCheckoutButtonContainer } = this.refs;
    const currentAddToCartButton = currentAddToCartButtonContainer?.refs.addToCartButton;

    // Update state and text for add-to-cart button
    if (!currentAddToCartButtonContainer || (!currentAddToCartButton && !acceleratedCheckoutButtonContainer)) return;

    // Update the button state
    if (event.detail.resource == null || event.detail.resource.available == false) {
      currentAddToCartButtonContainer.disable();
    } else {
      currentAddToCartButtonContainer.enable();
    }

    const newAddToCartButton = event.detail.data.html.querySelector('product-form-component [ref="addToCartButton"]');
    if (newAddToCartButton && currentAddToCartButton) {
      morph(currentAddToCartButton, newAddToCartButton);
    }

    if (acceleratedCheckoutButtonContainer) {
      if (event.detail.resource == null || event.detail.resource.available == false) {
        acceleratedCheckoutButtonContainer?.setAttribute('hidden', 'true');
      } else {
        acceleratedCheckoutButtonContainer?.removeAttribute('hidden');
      }
    }

    // Set the data attribute for the product variant media if it exists
    if (event.detail.resource) {
      const productVariantMedia = event.detail.resource.featured_media?.preview_image?.src;
      if (productVariantMedia) {
        this.refs.addToCartButtonContainer?.setAttribute(
          'data-product-variant-media',
          productVariantMedia + '&width=100'
        );
      }
    }

    // Check if quantity rules, price-per-item, or add-to-cart are appearing/disappearing (causes layout shift)
    const {
      quantityRules,
      pricePerItem,
      quantitySelector,
      productFormButtons,
      quantityLabel,
      quantitySelectorWrapper,
    } = this.refs;

    // Update quantity selector's min/max/step attributes and cart quantity for the new variant
    const newQuantityInput = /** @type {HTMLInputElement | null} */ (
      event.detail.data.html.querySelector('quantity-selector-component input[ref="quantityInput"]')
    );

    if (quantitySelector?.updateConstraints && newQuantityInput) {
      quantitySelector.updateConstraints(newQuantityInput.min, newQuantityInput.max || null, newQuantityInput.step);
    }

    const newQuantityRules = event.detail.data.html.querySelector('.quantity-rules');
    const isQuantityRulesChanging = !!quantityRules !== !!newQuantityRules;

    const newPricePerItem = event.detail.data.html.querySelector('price-per-item');
    const isPricePerItemChanging = !!pricePerItem !== !!newPricePerItem;

    if ((isQuantityRulesChanging || isPricePerItemChanging) && quantitySelector) {
      // Store quantity value before morphing entire container
      const currentQuantityValue = quantitySelector.getValue?.();

      const newProductFormButtons = event.detail.data.html.querySelector('.product-form-buttons');

      if (productFormButtons && newProductFormButtons) {
        morph(productFormButtons, newProductFormButtons);

        // Get the NEW quantity selector after morphing and update its constraints
        const newQuantityInputElement = /** @type {HTMLInputElement | null} */ (
          event.detail.data.html.querySelector('quantity-selector-component input[ref="quantityInput"]')
        );

        if (this.refs.quantitySelector?.updateConstraints && newQuantityInputElement && currentQuantityValue) {
          // Temporarily set the old value so updateConstraints can snap it properly
          this.refs.quantitySelector.setValue(currentQuantityValue);
          // updateConstraints will snap to valid increment if needed
          this.refs.quantitySelector.updateConstraints(
            newQuantityInputElement.min,
            newQuantityInputElement.max || null,
            newQuantityInputElement.step
          );
        }
      }
    } else {
      // Update elements individually when layout isn't changing
      /** @type {Array<[string, HTMLElement | undefined, HTMLElement | undefined]>} */
      const morphTargets = [
        ['.quantity-label', quantityLabel, quantitySelector],
        ['.quantity-rules', quantityRules, this.refs.productFormButtons],
        ['price-per-item', pricePerItem, quantitySelectorWrapper],
      ];

      for (const [selector, currentElement, fallback] of morphTargets) {
        this.#morphOrUpdateElement(currentElement, event.detail.data.html.querySelector(selector), fallback);
      }
    }

    // Morph volume pricing if it exists
    const currentVolumePricing = this.refs.volumePricing;
    const newVolumePricing = event.detail.data.html.querySelector('volume-pricing');
    this.#morphOrUpdateElement(currentVolumePricing, newVolumePricing, this.refs.productFormButtons);

    const hasB2BFeatures =
      quantityRules || newQuantityRules || pricePerItem || newPricePerItem || currentVolumePricing || newVolumePricing;

    if (!hasB2BFeatures) return;

    // Fetch and update cart quantity for the new variant
    await this.#fetchAndUpdateCartQuantity();
  };

  /**
   * Disable the add to cart button while the UI is updating before #onVariantUpdate is called.
   * Accelerated checkout button is also disabled via its own event listener not exposed to the theme.
   */
  #onVariantSelected = () => {
    this.refs.addToCartButtonContainer?.disable();
  };
}

if (!customElements.get('product-form-component')) {
  customElements.define('product-form-component', ProductFormComponent);
}