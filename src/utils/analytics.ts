// Google Analytics 4 utility functions
// GA4 is loaded by src/components/Analytics.tsx before these helpers are used.
import { PHOTO_RADAR, RAPID_RESOLUTION } from '@/config/offers';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

// Check if GA4 is available
export const isGA4Available = (): boolean => {
  return typeof window !== 'undefined' && typeof window.gtag === 'function';
};

// Track page views (usually handled automatically, but useful for SPA routing)
export const trackPageView = (page_title: string, page_location?: string): void => {
  if (isGA4Available()) {
    window.gtag?.('event', 'page_view', {
      page_title,
      page_location: page_location || `${window.location.origin}${window.location.pathname}`,
      page_path: window.location.pathname,
    });
  }
};

// Track custom events
export const trackEvent = (eventName: string, parameters?: Record<string, unknown>): void => {
  if (isGA4Available()) {
    window.gtag?.('event', eventName, {
      ...parameters,
    });
  }
};

// Track form submissions
export const trackFormSubmission = (formName: string, formLocation?: string): void => {
  trackEvent('form_submit', {
    form_name: formName,
    form_location: formLocation || window.location.pathname,
  });
};

// Track button clicks
export const trackButtonClick = (buttonName: string, buttonLocation?: string): void => {
  trackEvent('button_click', {
    button_name: buttonName,
    button_location: buttonLocation || window.location.pathname,
  });
};

// Track conversions (when someone completes the contact form)
export const trackConversion = (conversionType: 'contact_form' | 'phone_call' | 'email'): void => {
  trackEvent('generate_lead', {
    conversion_type: conversionType,
  });
};

// Track ticket type selections
export const trackTicketTypeSelection = (ticketType: string): void => {
  trackEvent('ticket_type_selected', {
    ticket_type: ticketType,
  });
};

// Track city selections
export const trackCitySelection = (city: string): void => {
  trackEvent('city_selected', {
    city: city,
  });
};

// Track file uploads (if you have ticket upload functionality)
export const trackFileUpload = (fileType: string): void => {
  trackEvent('file_upload', {
    file_type: fileType,
  });
};

// Track outbound links
export const trackOutboundLink = (url: string, linkText: string): void => {
  trackEvent('click', {
    event_category: 'outbound',
    event_label: url,
    transport_type: 'beacon',
    custom_parameter: linkText,
  });
};

// Enhanced ecommerce tracking for service purchases
export const trackPurchaseIntent = (serviceType: string, estimatedSavings?: number): void => {
  const offer = serviceType === 'photo_radar' ? PHOTO_RADAR : RAPID_RESOLUTION;
  trackEvent('begin_checkout', {
    currency: 'CAD',
    value: offer.priceCad,
    items: [
      {
        item_id: serviceType === 'photo_radar' ? 'photo_radar' : 'rapid_resolution',
        item_name: offer.name,
        price: offer.priceCad,
        quantity: 1,
      },
    ],
  });
};

// Track successful case completion (for thank you page)
export const trackServiceCompletion = (): void => {
  // Only the server-confirmed receipt flow may emit a paid purchase.
  trackEvent('service_completed');
};

export default {
  trackPageView,
  trackEvent,
  trackFormSubmission,
  trackButtonClick,
  trackConversion,
  trackTicketTypeSelection,
  trackCitySelection,
  trackFileUpload,
  trackOutboundLink,
  trackPurchaseIntent,
  trackServiceCompletion,
};
