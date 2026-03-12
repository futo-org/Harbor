/**
 * @fileoverview Swiper-based carousel component with navigation controls and slide progression.
 */

import { useEffect, useRef, useState } from 'react';

import { ArrowLeftIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import 'swiper/css';
import { Swiper, SwiperRef, SwiperSlide } from 'swiper/react';
import { useIsMobile } from '../../../hooks/styleHooks';

// Assumes that components will just modify application setting state so no direct state sharing is needed between components
// Takes in an array of component types that take in a nextSlide function

// Swiper carousel with progressive slide unlocking and navigation controls
export const Carousel = ({
  childComponents,
  className,
  onSlideChange,
  swiperClassName,
}: {
  childComponents: (({
    nextSlide,
    goBack,
  }: {
    nextSlide: () => void;
    goBack?: () => void;
  }) => JSX.Element)[];
  className?: string;
  onSlideChange?: (index: number) => void;
  swiperClassName?: string;
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [maxVisitedSlide, setMaxVisitedSlide] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const swiper = useRef<SwiperRef>(null);

  useEffect(() => {
    if (isTransitioning) {
      swiper.current?.swiper.slideTo(currentSlide);
      setIsTransitioning(false);
    }
  }, [isTransitioning, currentSlide]);

  const isMobile = useIsMobile();

  return (
    <div className={`${className} relative`}>
      <Swiper
        onSlideChange={(swiperInstance) => {
          const index = swiperInstance.activeIndex;
          setCurrentSlide(index);
          onSlideChange?.(index);
        }}
        allowSlideNext={currentSlide < maxVisitedSlide || isTransitioning}
        allowSlidePrev={currentSlide > 0 || isTransitioning}
        className={swiperClassName}
        ref={swiper}
        allowTouchMove={isMobile}
      >
        {childComponents.map((Child, i) => (
          <SwiperSlide key={i}>
            <Child
              nextSlide={() => {
                if (currentSlide < childComponents.length - 1) {
                  setCurrentSlide(currentSlide + 1);
                  setIsTransitioning(true);
                  setMaxVisitedSlide(
                    Math.max(currentSlide + 1, maxVisitedSlide),
                  );
                }
              }}
              goBack={() => {
                if (currentSlide > 0) {
                  setCurrentSlide(currentSlide - 1);
                  setIsTransitioning(true);
                }
              }}
            />
          </SwiperSlide>
        ))}
      </Swiper>
      <div className="hidden md:flex absolute top-1/2 w-full justify-between space-x-5 z-20 pointer-events-none">
        {currentSlide > 0 ? (
          <button
            type="button"
            className="swiper-button-prev md:flex justify-self-end w-20 h-20 rounded-full bg-white border justify-center items-center pointer-events-auto"
            onClick={() => {
              if (currentSlide > 0) {
                setCurrentSlide(currentSlide - 1);
                setIsTransitioning(true);
              }
            }}
          >
            <ArrowLeftIcon className="w-8 h-8" />
          </button>
        ) : (
          <div />
        )}
        {currentSlide < maxVisitedSlide ? (
          <button
            className={`swiper-button-next justify-self-end hidden md:flex w-20 h-20 rounded-full bg-white border justify-center items-center pointer-events-auto`}
            onClick={() => {
              if (currentSlide < childComponents.length - 1) {
                setCurrentSlide(currentSlide + 1);
                setIsTransitioning(true);
                setMaxVisitedSlide(Math.max(currentSlide + 1, maxVisitedSlide));
              }
            }}
          >
            <ArrowRightIcon className="w-8 h-8" />
          </button>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
};
