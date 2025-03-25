interface CarouselElements {
    slides: NodeListOf<Element>;
    dots: NodeListOf<Element>;
    prevBtn: HTMLElement;
    nextBtn: HTMLElement;
}

/**
 * Navigate to a specific slide in the carousel
 * @param index The index of the slide to show
 * @param carousel The carousel container element
 */
function showSlide(index: number, carousel: Element): void {
    const elements = getCarouselElements(carousel);
    if (!elements) return;

    const { slides, dots } = elements;

    // Hide all slides and deactivate all dots
    slides.forEach(slide => {
        slide.classList.remove('active');
    });

    dots.forEach(dot => {
        dot.classList.remove('active');
    });

    // Show the selected slide and activate the corresponding dot
    slides[index].classList.add('active');
    dots[index].classList.add('active');
}

/**
 * Navigate the carousel in a specific direction
 * @param direction The direction to navigate (-1 for previous, 1 for next)
 * @param carousel The carousel container element
 */
function navigateSlide(direction: number, carousel: Element): void {
    const elements = getCarouselElements(carousel);
    if (!elements) return;

    const { slides } = elements;
    let currentIndex = 0;

    // Find the current active slide index
    slides.forEach((slide, index) => {
        if (slide.classList.contains('active')) {
            currentIndex = index;
        }
    });

    // Calculate new index
    let newIndex = currentIndex + direction;

    // Handle wraparound
    if (newIndex < 0) {
        newIndex = slides.length - 1;
    } else if (newIndex >= slides.length) {
        newIndex = 0;
    }

    // Show the new slide
    showSlide(newIndex, carousel);
}

/**
 * Get all required elements for a carousel
 * @param carousel The carousel container element
 * @returns An object containing all carousel elements or null if any required element is missing
 */
function getCarouselElements(carousel: Element): CarouselElements | null {
    const slides = carousel.querySelectorAll('.carousel-slide');
    const dots = carousel.querySelectorAll('.dot');
    const prevBtn = carousel.querySelector('.prev-btn') as HTMLElement;
    const nextBtn = carousel.querySelector('.next-btn') as HTMLElement;

    if (!slides || !dots || !prevBtn || !nextBtn) {
        console.error('Missing required carousel elements');
        return null;
    }

    return { slides, dots, prevBtn, nextBtn };
}

/**
 * Initialize a carousel with navigation controls
 * @param carousel The carousel container element
 */
function initializeCarousel(carousel: Element): void {
    const elements = getCarouselElements(carousel);
    if (!elements) return;

    const { dots, prevBtn, nextBtn } = elements;

    // Setup navigation
    prevBtn.addEventListener('click', () => {
        navigateSlide(-1, carousel);
    });

    nextBtn.addEventListener('click', () => {
        navigateSlide(1, carousel);
    });

    // Setup dots navigation
    dots.forEach(dot => {
        dot.addEventListener('click', () => {
            const slideIndex = parseInt(dot.getAttribute('data-index') || '0');
            showSlide(slideIndex, carousel);
        });
    });
}

/**
 * Initialize all carousels on the page
 */
function initializeCarousels(): void {
    document.addEventListener('DOMContentLoaded', () => {
        const carousels = document.querySelectorAll('.carousel-container');
        carousels.forEach(carousel => {
            initializeCarousel(carousel);
        });
    });
}

// Export functions for use in other modules
export {
    initializeCarousels,
    initializeCarousel,
    navigateSlide,
    showSlide
};
