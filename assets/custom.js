// product page People Viewing 

/* <div class="people-viewing">
  <span class="people-viewing__icon">
    👁
  </span>
  <span class="people-viewing__text">
    <span id="peopleViewingCount">71</span> People Viewing
  </span>
</div> */

  document.addEventListener('DOMContentLoaded', function () {
    var countEl = document.getElementById('peopleViewingCount');
    if (!countEl) return;

    function updateCount() {
      var min = 30;
      var max = 80;
      var randomCount = Math.floor(Math.random() * (max - min + 1)) + min;
      countEl.textContent = randomCount;
    }

    updateCount();
    setInterval(updateCount, 5000); 
  });


// Show Product Page Offer On click Offer
document.addEventListener('change', function (e) {
  if (e.target.name === 'purchase_offer') {
    const buy2Box = document.querySelector('.buy-2-variants');
    if (!buy2Box) return;

    if (e.target.checked) {
      buy2Box.classList.add('active-s');
    } else {
      buy2Box.classList.remove('active-s');
    }
  }
});



// Faq Filters,
// FAQ Filters (Merged)
document.addEventListener("DOMContentLoaded", function () {

  function initFaqFilters(wrapperSelector) {
    document.querySelectorAll(wrapperSelector).forEach(faqWrapper => {

      const categoryWrapper =
        faqWrapper.previousElementSibling?.classList.contains("faq-category")
          ? faqWrapper.previousElementSibling
          : faqWrapper.parentElement.querySelector(".faq-category");

      if (!categoryWrapper) return;

      const accordions = faqWrapper.querySelectorAll("accordion-custom");
      if (!accordions.length) return;

      const categories = new Set();

      // 1. Collect categories from accordion classes
      accordions.forEach(acc => {
        acc.classList.forEach(cls => {
          if (
            cls !== "hide-s" &&
            cls !== "open-by-default-on-desktop" &&
            cls !== "open-by-default-on-mobile"
          ) {
            categories.add(cls);
          }
        });
      });

      // 2. Build tabs
      categoryWrapper.innerHTML =
        `<span class="active-s" data-filter="all">All</span>`;

      categories.forEach(cat => {
        if (cat.toLowerCase() !== "all") {
          categoryWrapper.insertAdjacentHTML(
            "beforeend",
            `<span data-filter="${cat}">${cat}</span>`
          );
        }
      });

      const tabs = categoryWrapper.querySelectorAll("span");

      // 3. Filter logic
      tabs.forEach(tab => {
        tab.addEventListener("click", function () {
          const filter = this.dataset.filter;

          tabs.forEach(t => t.classList.remove("active-s"));
          this.classList.add("active-s");

          accordions.forEach(acc => {
            if (filter === "all" || acc.classList.contains(filter)) {
              acc.classList.remove("hide-s");
            } else {
              acc.classList.add("hide-s");
            }
          });
        });
      });

    });
  }

  // Initialize for both FAQ layouts
  initFaqFilters(".faq-s");
  initFaqFilters(".mb_faq_pills");

});


// Horizontal Drag Scroll 
(function () {

  const dragScrollElements = document.querySelectorAll(
    '.cart-upsell-grid, .product-video-list, .variant-option--swatches'
  );

  if (!dragScrollElements.length) return;

  dragScrollElements.forEach((dragContainer) => {

    let isDraggingScroll = false;
    let dragStartXPosition = 0;
    let dragStartScrollLeft = 0;

    // Mouse Down
    dragContainer.addEventListener("mousedown", function (event) {
      isDraggingScroll = true;
      dragContainer.classList.add("no-drag-active");
      dragContainer.style.cursor = "grabbing";

      dragStartXPosition = event.clientX;
      dragStartScrollLeft = dragContainer.scrollLeft;

      event.preventDefault();
    });

    // Mouse Up
    document.addEventListener("mouseup", function () {
      isDraggingScroll = false;
      dragContainer.classList.remove("no-drag-active");
      dragContainer.style.cursor = "grab";
    });

    // Mouse Move
    dragContainer.addEventListener("mousemove", function (event) {
      if (!isDraggingScroll) return;

      const currentMouseX = event.clientX;
      const dragDistance = (currentMouseX - dragStartXPosition) * 1.8;

      dragContainer.scrollLeft = dragStartScrollLeft - dragDistance;

      event.preventDefault();
    });

    // Horizontal Wheel Scroll — passive:true lets browser optimize scroll
    dragContainer.addEventListener(
      "wheel",
      function (event) {
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
          dragContainer.scrollLeft += event.deltaX;
        }
      },
      { passive: true }
    );

    // Touch Support
    let touchStartPositionX = 0;
    let touchStartScroll = 0;

    dragContainer.addEventListener("touchstart", function (event) {
      touchStartPositionX = event.touches[0].clientX;
      touchStartScroll = dragContainer.scrollLeft;
    });

    dragContainer.addEventListener("touchmove", function (event) {
      const currentTouchX = event.touches[0].clientX;
      const touchDistance = (currentTouchX - touchStartPositionX) * 1.2;

      dragContainer.scrollLeft = touchStartScroll - touchDistance;
    });

  });

})();
