// Google Analytics 4 utility functions
// Make sure GA4 is loaded in index.html before using these functions

declare global {
  interface Window {
    gtag: (...args: any[]) => void;
    dataLayer: any[];
  }
}

// Check if GA4 is available
export const isGA4Available = (): boolean => {
  return typeof window !== 'undefined' && typeof window.gtag === 'function';
};

// Track page views (usually handled automatically, but useful for SPA routing)
export const trackPageView = (page_title: string, page_location?: string): void => {
  if (isGA4Available()) {
    window.gtag('config', 'G-YRP61S5TPF', {
      page_title,
      page_location: page_location || window.location.href,
    });
  }
};

// Track custom events
export const trackEvent = (eventName: string, parameters?: Record<string, any>): void => {
  if (isGA4Available()) {
    window.gtag('event', eventName, {
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
  trackEvent('conversion', {
    conversion_type: conversionType,
    value: 488, // Your service price
    currency: 'CAD',
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
  trackEvent('begin_checkout', {
    currency: 'CAD',
    value: 488,
    items: [
      {
        item_id: 'traffic_ticket_defense',
        item_name: 'Traffic Ticket Defense Service',
        category: 'Legal Services',
        price: 488,
        quantity: 1,
        custom_parameter_1: serviceType,
        custom_parameter_2: estimatedSavings?.toString() || '',
      },
    ],
  });
};

// Track successful case completion (for thank you page)
export const trackServiceCompletion = (): void => {
  trackEvent('purchase', {
    transaction_id: `fabsy_${Date.now()}`,
    currency: 'CAD',
    value: 488,
    items: [
      {
        item_id: 'traffic_ticket_defense',
        item_name: 'Traffic Ticket Defense Service',
        category: 'Legal Services',
        price: 488,
        quantity: 1,
      },
    ],
  });
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