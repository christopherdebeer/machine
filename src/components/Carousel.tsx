import React, { useState, useEffect } from 'react';
import { CodeEditor } from './CodeEditor';

interface CarouselSlide {
    code: string;
    id: string;
}

interface CarouselProps {
    slides: CarouselSlide[];
}

export const Carousel: React.FC<CarouselProps> = ({ slides }) => {
    const [currentIndex, setCurrentIndex] = useState(0);

    const next = () => {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % slides.length);
    };

    const prev = () => {
        setCurrentIndex((prevIndex) => (prevIndex - 1 + slides.length) % slides.length);
    };

    const goToSlide = (index: number) => {
        setCurrentIndex(index);
    };

    useEffect(() => {
        // Initialize carousel state
        setCurrentIndex(0);
    }, []);

    if (slides.length === 0) {
        return null;
    }

    return (
        <div className="code-block carousel-container">
            <div className="carousel">
                {slides.map((slide, index) => (
                    <div
                        key={slide.id}
                        className={`carousel-slide ${index === currentIndex ? 'active' : ''}`}
                        style={{ display: index === currentIndex ? 'block' : 'none' }}
                    >
                        <CodeEditor
                            initialCode={slide.code}
                            language="machine"
                            id={slide.id}
                        />
                    </div>
                ))}
            </div>
            {slides.length > 1 && (
                <div className="carousel-nav">
                    <button className="prev-btn" onClick={prev}>&lt;</button>
                    <div className="carousel-dots">
                        {slides.map((_, index) => (
                            <span
                                key={index}
                                className={`dot ${index === currentIndex ? 'active' : ''}`}
                                data-index={index}
                                onClick={() => goToSlide(index)}
                            />
                        ))}
                    </div>
                    <button className="next-btn" onClick={next}>&gt;</button>
                </div>
            )}
        </div>
    );
};
