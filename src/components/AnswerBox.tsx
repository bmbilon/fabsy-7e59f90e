import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, CheckCircle, Shield } from 'lucide-react';
import { RAPID_RESOLUTION } from '@/config/offers';

type Props = {
  offence: string;
  city: string;
  ctaHref?: string;
  className?: string;
};

/**
 * AnswerBox - 60-second answer component for Alberta traffic ticket pages
 * Provides immediate value with answer-first approach optimized for AEO
 */
const AnswerBox: React.FC<Props> = ({ 
  offence, 
  city, 
  ctaHref = RAPID_RESOLUTION.slug,
  className = "" 
}) => {
  // Format offence for display (handle various cases)
  const displayOffence = offence.toLowerCase().replace(/[-_]/g, ' ');
  const capitalizedOffence = displayOffence.charAt(0).toUpperCase() + displayOffence.slice(1);

  return (
    <section className={`bg-gradient-to-br from-sky-50 to-blue-50 border border-sky-200 rounded-2xl p-6 my-6 ${className}`}>
      {/* Header with timing indicator */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-1 text-sky-700">
          <Clock className="w-4 h-4" />
          <span className="text-sm font-medium">60-second answer</span>
        </div>
        <div className="flex items-center gap-1 text-green-600 text-xs">
          <CheckCircle className="w-3 h-3" />
          <span>Alberta-focused information</span>
        </div>
      </div>

      {/* Main question and answer */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">
          Can I dispute a {displayOffence} ticket in {city}?
        </h2>
        <p className="text-slate-700 font-medium">
          <span className="text-green-600 font-semibold">Yes.</span> Follow the instructions on your ticket and act by the deadline printed on it.
        </p>
      </div>

      {/* Process steps */}
      <div className="mb-5">
        <ol className="space-y-2 text-sm text-slate-700">
          <li className="flex items-start gap-3">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-xs font-semibold mt-0.5 flex-shrink-0">1</span>
            <div>
              <span className="font-semibold">Deadline:</span> Check the ticket for the date and instructions that apply to your matter.
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-xs font-semibold mt-0.5 flex-shrink-0">2</span>
            <div><span className="font-semibold">Context:</span> The practical choice depends on the charge, record, evidence, and what a conviction could mean for you.</div>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-xs font-semibold mt-0.5 flex-shrink-0">3</span>
            <div><span className="font-semibold">Rapid Resolution:</span> Secure intake, disclosure review, prosecutor review, immediate updates and your final decision for an eligible pre-trial matter.</div>
          </li>
        </ol>
      </div>

      {/* CTA section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Link 
          to={ctaHref}
          className="inline-flex items-center gap-2 px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-colors"
        >
          <Shield className="w-4 h-4" />
          Rapid Resolution - ${RAPID_RESOLUTION.priceCad} →
        </Link>
        <div className="text-xs text-slate-600">
          Plus GST · Complete disclosure advanced within 48 hours · Crown timing separate
        </div>
      </div>

      {/* Local indicator */}
      <div className="mt-4 pt-3 border-t border-sky-200 text-xs text-slate-500">
        Serving {city}, Alberta • {capitalizedOffence} ticket information • Eligible pre-trial agent service
      </div>
    </section>
  );
};

export default AnswerBox;
