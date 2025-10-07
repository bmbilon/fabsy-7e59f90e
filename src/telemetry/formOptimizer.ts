/**
 * FABSY AEO SNAPSHOT — ALBERTA ONLY
 * Block 12: Conversion Layer & Form Telemetry - Form Optimization
 * 
 * Progressive enhancement for form completion rates, field analytics,
 * autofill detection, validation optimization, and conversion barriers reduction
 */

interface FormFieldMetrics {
  fieldId: string;
  fieldName: string;
  fieldType: string;
  interactions: number;
  completions: number;
  errors: number;
  avgTimeToComplete: number;
  dropoffRate: number;
  errorMessages: string[];
  autofillDetected: boolean;
}

interface FormAnalytics {
  formId: string;
  totalStarts: number;
  totalCompletions: number;
  completionRate: number;
  avgTimeToComplete: number;
  dropoffPoints: FormFieldMetrics[];
  conversionBarriers: string[];
  optimizationScore: number;
}

interface FormOptimizationConfig {
  enableAutofillDetection: boolean;
  enableProgressIndicator: boolean;
  enableFieldValidation: boolean;
  enableSmartDefaults: boolean;
  trackingEndpoint: string;
  cityDetectionAPI?: string;
  offenceDetectionAPI?: string;
}

class FormOptimizer {
  private config: FormOptimizationConfig;
  private fieldMetrics = new Map<string, FormFieldMetrics>();
  private formStartTime: number = 0;
  private fieldStartTimes = new Map<string, number>();
  private observer?: IntersectionObserver;

  constructor(config: FormOptimizationConfig) {
    this.config = config;
    this.initialize();
  }

  private initialize(): void {
    if (typeof window === 'undefined') return;

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupFormOptimization());
    } else {
      this.setupFormOptimization();
    }
  }

  private setupFormOptimization(): void {
    // Find all forms on the page
    const forms = document.querySelectorAll('form[data-optimize="true"], form.conversion-form');
    
    forms.forEach(form => {
      this.enhanceForm(form as HTMLFormElement);
    });

    // Setup autofill detection
    if (this.config.enableAutofillDetection) {
      this.setupAutofillDetection();
    }
  }

  private enhanceForm(form: HTMLFormElement): void {
    const formId = form.id || `form_${Date.now()}`;
    form.setAttribute('data-form-id', formId);

    // Add progress indicator
    if (this.config.enableProgressIndicator) {
      this.addProgressIndicator(form);
    }

    // Setup field tracking
    this.setupFieldTracking(form);

    // Smart defaults and prefill
    if (this.config.enableSmartDefaults) {
      this.setupSmartDefaults(form);
    }

    // Enhanced validation
    if (this.config.enableFieldValidation) {
      this.setupEnhancedValidation(form);
    }

    // Form start tracking
    form.addEventListener('focusin', (e) => {
      if (this.formStartTime === 0) {
        this.formStartTime = Date.now();
        this.trackEvent('form_start', { formId, timestamp: this.formStartTime });
      }
    }, { once: true });

    // Form submission tracking
    form.addEventListener('submit', (e) => {
      this.handleFormSubmission(form, e);
    });
  }

  private addProgressIndicator(form: HTMLFormElement): void {
    const fields = form.querySelectorAll('input:not([type="hidden"]), select, textarea');
    if (fields.length <= 3) return; // Don't add for short forms

    const progressContainer = document.createElement('div');
    progressContainer.className = 'form-progress';
    progressContainer.innerHTML = `
      <div class="progress-bar">
        <div class="progress-fill" style="width: 0%"></div>
      </div>
      <span class="progress-text">Step 1 of ${fields.length}</span>
    `;

    // Insert progress indicator at the top of the form
    form.insertBefore(progressContainer, form.firstChild);

    // Update progress on field completion
    const updateProgress = () => {
      const completedFields = Array.from(fields).filter(field => {
        const input = field as HTMLInputElement;
        return input.value.trim() !== '' && input.validity.valid;
      }).length;

      const progressPercentage = (completedFields / fields.length) * 100;
      const progressFill = form.querySelector('.progress-fill') as HTMLElement;
      const progressText = form.querySelector('.progress-text') as HTMLElement;

      if (progressFill) {
        progressFill.style.width = `${progressPercentage}%`;
      }
      if (progressText) {
        progressText.textContent = `Step ${completedFields + 1} of ${fields.length}`;
      }
    };

    fields.forEach(field => {
      field.addEventListener('input', updateProgress);
      field.addEventListener('change', updateProgress);
    });
  }

  private setupFieldTracking(form: HTMLFormElement): void {
    const fields = form.querySelectorAll('input:not([type="hidden"]), select, textarea');

    fields.forEach(field => {
      const input = field as HTMLInputElement;
      const fieldId = input.id || input.name || `field_${Date.now()}_${Math.random()}`;
      
      // Initialize field metrics
      this.fieldMetrics.set(fieldId, {
        fieldId,
        fieldName: input.name || fieldId,
        fieldType: input.type || input.tagName.toLowerCase(),
        interactions: 0,
        completions: 0,
        errors: 0,
        avgTimeToComplete: 0,
        dropoffRate: 0,
        errorMessages: [],
        autofillDetected: false
      });

      // Track field focus (interaction start)
      input.addEventListener('focus', () => {
        this.fieldStartTimes.set(fieldId, Date.now());
        const metrics = this.fieldMetrics.get(fieldId)!;
        metrics.interactions++;
        this.trackEvent('field_focus', { fieldId, fieldName: metrics.fieldName });
      });

      // Track field completion
      input.addEventListener('blur', () => {
        const startTime = this.fieldStartTimes.get(fieldId);
        const metrics = this.fieldMetrics.get(fieldId)!;
        
        if (input.value.trim() !== '') {
          metrics.completions++;
          
          if (startTime) {
            const timeToComplete = Date.now() - startTime;
            metrics.avgTimeToComplete = (metrics.avgTimeToComplete + timeToComplete) / metrics.completions;
          }
          
          this.trackEvent('field_complete', {
            fieldId,
            fieldName: metrics.fieldName,
            timeToComplete: startTime ? Date.now() - startTime : 0
          });
        }

        this.fieldStartTimes.delete(fieldId);
      });

      // Track validation errors
      input.addEventListener('invalid', (e) => {
        const metrics = this.fieldMetrics.get(fieldId)!;
        metrics.errors++;
        
        const errorMessage = (e.target as HTMLInputElement).validationMessage;
        if (errorMessage && !metrics.errorMessages.includes(errorMessage)) {
          metrics.errorMessages.push(errorMessage);
        }

        this.trackEvent('field_error', {
          fieldId,
          fieldName: metrics.fieldName,
          errorMessage
        });
      });
    });
  }

  private setupSmartDefaults(form: HTMLFormElement): void {
    // Auto-detect city from geolocation or previous selections
    this.setupCityAutodetection(form);
    
    // Prefill based on URL parameters or local storage
    this.setupIntelligentPrefill(form);
    
    // Smart field ordering based on conversion data
    this.optimizeFieldOrder(form);
  }

  private setupCityAutodetection(form: HTMLFormElement): void {
    const cityFields = form.querySelectorAll('select[name*="city"], input[name*="city"]');
    
    if (cityFields.length === 0 || !this.config.cityDetectionAPI) return;

    // Try to get user's location
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        try {
          const response = await fetch(`${this.config.cityDetectionAPI}?lat=${position.coords.latitude}&lng=${position.coords.longitude}`);
          const locationData = await response.json();
          
          if (locationData.city) {
            cityFields.forEach(field => {
              const cityField = field as HTMLSelectElement | HTMLInputElement;
              
              if (cityField.tagName === 'SELECT') {
                const option = cityField.querySelector(`option[value*="${locationData.city}"]`) as HTMLOptionElement;
                if (option) {
                  cityField.value = option.value;
                  cityField.dispatchEvent(new Event('change', { bubbles: true }));
                }
              } else {
                cityField.value = locationData.city;
                cityField.dispatchEvent(new Event('input', { bubbles: true }));
              }
            });

            this.trackEvent('city_autodetected', { 
              city: locationData.city,
              accuracy: position.coords.accuracy 
            });
          }
        } catch (error) {
          console.warn('Failed to auto-detect city:', error);
        }
      }, 
      () => {
        // Fallback to IP-based location if available
        this.tryIPBasedLocation(cityFields);
      },
      { timeout: 10000, enableHighAccuracy: false });
    } else {
      // Fallback to IP-based location
      this.tryIPBasedLocation(cityFields);
    }
  }

  private async tryIPBasedLocation(cityFields: NodeListOf<Element>): Promise<void> {
    try {
      // Use a public IP geolocation service
      const response = await fetch('https://ipapi.co/json/');
      const locationData = await response.json();
      
      if (locationData.city && locationData.country_code === 'CA') {
        // Only auto-fill for Canadian locations
        const canadianProvinces = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];
        
        if (canadianProvinces.includes(locationData.region_code)) {
          cityFields.forEach(field => {
            const cityField = field as HTMLSelectElement | HTMLInputElement;
            
            if (cityField.tagName === 'SELECT') {
              const option = cityField.querySelector(`option[value*="${locationData.city}"]`) as HTMLOptionElement;
              if (option) {
                cityField.value = option.value;
                cityField.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
          });

          this.trackEvent('city_autodetected_ip', { 
            city: locationData.city,
            province: locationData.region_code 
          });
        }
      }
    } catch (error) {
      console.warn('IP-based location detection failed:', error);
    }
  }

  private setupIntelligentPrefill(form: HTMLFormElement): void {
    // Check URL parameters for prefill data
    const urlParams = new URLSearchParams(window.location.search);
    const fields = form.querySelectorAll('input, select, textarea');

    fields.forEach(field => {
      const input = field as HTMLInputElement;
      const paramValue = urlParams.get(input.name);
      
      if (paramValue && !input.value) {
        input.value = paramValue;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        
        this.trackEvent('field_prefilled', {
          fieldName: input.name,
          source: 'url_param',
          value: paramValue.length // Don't track actual values for privacy
        });
      }
    });

    // Check localStorage for previous form data (privacy-safe)
    const previousData = this.getPreviousFormData(form);
    if (previousData) {
      Object.entries(previousData).forEach(([fieldName, value]) => {
        const field = form.querySelector(`[name="${fieldName}"]`) as HTMLInputElement;
        if (field && !field.value && typeof value === 'string') {
          field.value = value;
          field.dispatchEvent(new Event('input', { bubbles: true }));
          
          this.trackEvent('field_prefilled', {
            fieldName,
            source: 'previous_session'
          });
        }
      });
    }
  }

  private optimizeFieldOrder(form: HTMLFormElement): void {
    // Get conversion data for field order optimization
    const fieldOrder = this.getOptimalFieldOrder(form);
    
    if (fieldOrder.length > 0) {
      this.reorderFormFields(form, fieldOrder);
    }
  }

  private getOptimalFieldOrder(form: HTMLFormElement): string[] {
    // This would typically be driven by analytics data
    // For now, use best practices for legal intake forms
    const priorityOrder = [
      'name', 'first_name', 'last_name',
      'email', 'phone', 'city', 'offence',
      'incident_date', 'court_date',
      'description', 'additional_info'
    ];

    return priorityOrder;
  }

  private reorderFormFields(form: HTMLFormElement, optimalOrder: string[]): void {
    const fieldContainer = form.querySelector('.form-fields') || form;
    const fields = Array.from(fieldContainer.children);
    
    const fieldMap = new Map<string, Element>();
    fields.forEach(field => {
      const input = field.querySelector('input, select, textarea') as HTMLInputElement;
      if (input && input.name) {
        fieldMap.set(input.name, field);
      }
    });

    // Reorder based on optimal order
    optimalOrder.forEach(fieldName => {
      const field = fieldMap.get(fieldName);
      if (field) {
        fieldContainer.appendChild(field);
      }
    });
  }

  private setupEnhancedValidation(form: HTMLFormElement): void {
    const fields = form.querySelectorAll('input, select, textarea');

    fields.forEach(field => {
      const input = field as HTMLInputElement;
      
      // Real-time validation feedback
      input.addEventListener('input', () => {
        this.validateField(input);
      });

      // Enhanced email validation
      if (input.type === 'email') {
        this.setupEmailValidation(input);
      }

      // Phone number formatting and validation
      if (input.type === 'tel' || input.name.includes('phone')) {
        this.setupPhoneValidation(input);
      }
    });
  }

  private validateField(input: HTMLInputElement): void {
    const isValid = input.checkValidity();
    const fieldContainer = input.closest('.form-field') || input.parentElement;
    
    if (fieldContainer) {
      fieldContainer.classList.toggle('field-valid', isValid && input.value.trim() !== '');
      fieldContainer.classList.toggle('field-invalid', !isValid && input.value.trim() !== '');
    }

    // Custom validation messages
    if (!isValid && input.value.trim() !== '') {
      this.showCustomValidationMessage(input);
    } else {
      this.hideValidationMessage(input);
    }
  }

  private setupEmailValidation(input: HTMLInputElement): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    input.addEventListener('blur', () => {
      if (input.value && !emailRegex.test(input.value)) {
        input.setCustomValidity('Please enter a valid email address');
      } else {
        input.setCustomValidity('');
      }
    });
  }

  private setupPhoneValidation(input: HTMLInputElement): void {
    input.addEventListener('input', () => {
      // Format phone number as user types
      let value = input.value.replace(/\D/g, '');
      
      if (value.length >= 10) {
        value = value.substring(0, 10);
        value = `(${value.substring(0, 3)}) ${value.substring(3, 6)}-${value.substring(6)}`;
        input.value = value;
      }
    });
  }

  private showCustomValidationMessage(input: HTMLInputElement): void {
    const existingMessage = input.parentElement?.querySelector('.validation-message');
    if (existingMessage) return;

    const message = document.createElement('div');
    message.className = 'validation-message';
    message.textContent = input.validationMessage;
    
    input.parentElement?.appendChild(message);
  }

  private hideValidationMessage(input: HTMLInputElement): void {
    const message = input.parentElement?.querySelector('.validation-message');
    if (message) {
      message.remove();
    }
  }

  private setupAutofillDetection(): void {
    // Detect browser autofill
    const checkAutofill = (input: HTMLInputElement) => {
      const fieldId = input.id || input.name;
      const metrics = this.fieldMetrics.get(fieldId);
      
      if (metrics && input.matches(':-webkit-autofill') || input.value !== '' && !this.fieldStartTimes.has(fieldId)) {
        metrics.autofillDetected = true;
        this.trackEvent('autofill_detected', {
          fieldId,
          fieldName: metrics.fieldName
        });
      }
    };

    // Check all inputs periodically
    setInterval(() => {
      document.querySelectorAll('input').forEach(input => {
        checkAutofill(input as HTMLInputElement);
      });
    }, 1000);
  }

  private handleFormSubmission(form: HTMLFormElement, event: Event): void {
    const formId = form.getAttribute('data-form-id');
    const timeToComplete = this.formStartTime > 0 ? Date.now() - this.formStartTime : 0;
    
    // Calculate completion metrics
    const analytics = this.generateFormAnalytics(form);
    
    this.trackEvent('form_submit', {
      formId,
      timeToComplete,
      completionRate: analytics.completionRate,
      optimizationScore: analytics.optimizationScore
    });

    // Save form data for future prefill (privacy-safe)
    this.savePreviousFormData(form);
  }

  private generateFormAnalytics(form: HTMLFormElement): FormAnalytics {
    const formId = form.getAttribute('data-form-id') || 'unknown';
    const fields = Array.from(this.fieldMetrics.values());
    
    const totalStarts = Math.max(...fields.map(f => f.interactions), 1);
    const totalCompletions = fields.reduce((sum, f) => sum + f.completions, 0);
    const completionRate = totalCompletions / (fields.length * totalStarts);
    
    const dropoffPoints = fields
      .filter(f => f.interactions > 0)
      .map(f => ({
        ...f,
        dropoffRate: 1 - (f.completions / f.interactions)
      }))
      .sort((a, b) => b.dropoffRate - a.dropoffRate);

    const conversionBarriers = this.identifyConversionBarriers(dropoffPoints);
    const optimizationScore = this.calculateOptimizationScore(fields, completionRate);

    return {
      formId,
      totalStarts,
      totalCompletions,
      completionRate,
      avgTimeToComplete: this.formStartTime > 0 ? Date.now() - this.formStartTime : 0,
      dropoffPoints,
      conversionBarriers,
      optimizationScore
    };
  }

  private identifyConversionBarriers(dropoffPoints: FormFieldMetrics[]): string[] {
    const barriers: string[] = [];
    
    dropoffPoints.forEach(field => {
      if (field.dropoffRate > 0.3) {
        barriers.push(`High dropoff on ${field.fieldName} (${(field.dropoffRate * 100).toFixed(1)}%)`);
      }
      if (field.errors / field.interactions > 0.2) {
        barriers.push(`High error rate on ${field.fieldName} (${(field.errors / field.interactions * 100).toFixed(1)}%)`);
      }
      if (field.avgTimeToComplete > 30000) { // 30 seconds
        barriers.push(`Long completion time on ${field.fieldName} (${(field.avgTimeToComplete / 1000).toFixed(1)}s)`);
      }
    });

    return barriers;
  }

  private calculateOptimizationScore(fields: FormFieldMetrics[], completionRate: number): number {
    let score = completionRate * 100;
    
    fields.forEach(field => {
      if (field.autofillDetected) score += 5; // Bonus for autofill support
      if (field.errors === 0) score += 2; // Bonus for error-free fields
      if (field.avgTimeToComplete < 10000) score += 3; // Bonus for quick completion
    });

    return Math.min(score, 100);
  }

  private savePreviousFormData(form: HTMLFormElement): void {
    const formData: Record<string, string> = {};
    const inputs = form.querySelectorAll('input:not([type="password"]), select');
    
    inputs.forEach(input => {
      const field = input as HTMLInputElement | HTMLSelectElement;
      if (field.name && field.value && field.type !== 'email') {
        // Only save non-sensitive data
        if (['text', 'select-one', 'radio', 'checkbox'].includes(field.type)) {
          formData[field.name] = field.value;
        }
      }
    });

    try {
      localStorage.setItem('fabsy_form_prefill', JSON.stringify(formData));
    } catch (error) {
      console.warn('Could not save form prefill data:', error);
    }
  }

  private getPreviousFormData(form: HTMLFormElement): Record<string, string> | null {
    try {
      const data = localStorage.getItem('fabsy_form_prefill');
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.warn('Could not retrieve form prefill data:', error);
      return null;
    }
  }

  private trackEvent(eventName: string, properties: Record<string, any>): void {
    // Send to telemetry endpoint
    if (this.config.trackingEndpoint) {
      fetch(this.config.trackingEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event: eventName,
          properties: {
            ...properties,
            timestamp: Date.now(),
            url: window.location.href,
            userAgent: navigator.userAgent
          }
        })
      }).catch(error => {
        console.warn('Failed to track event:', eventName, error);
      });
    }
  }

  // Public API methods
  getFormAnalytics(formId?: string): FormAnalytics | FormAnalytics[] {
    const forms = document.querySelectorAll(formId ? `form[data-form-id="${formId}"]` : 'form[data-form-id]');
    
    if (forms.length === 1) {
      return this.generateFormAnalytics(forms[0] as HTMLFormElement);
    }
    
    return Array.from(forms).map(form => this.generateFormAnalytics(form as HTMLFormElement));
  }

  getFieldMetrics(): FormFieldMetrics[] {
    return Array.from(this.fieldMetrics.values());
  }

  resetMetrics(): void {
    this.fieldMetrics.clear();
    this.fieldStartTimes.clear();
    this.formStartTime = 0;
  }
}

// Factory function
export function createFormOptimizer(config: FormOptimizationConfig): FormOptimizer {
  return new FormOptimizer(config);
}

// Default configuration
export const defaultFormConfig: FormOptimizationConfig = {
  enableAutofillDetection: true,
  enableProgressIndicator: true,
  enableFieldValidation: true,
  enableSmartDefaults: true,
  trackingEndpoint: '/api/telemetry',
  cityDetectionAPI: '/api/location/city',
  offenceDetectionAPI: '/api/offence/predict'
};

export default FormOptimizer;
export type { FormOptimizationConfig, FormAnalytics, FormFieldMetrics };