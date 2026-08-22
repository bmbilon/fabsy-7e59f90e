import React from "react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import useSafeHead from "@/hooks/useSafeHead";
import { Button } from "@/components/ui/button";
import { CheckCircle, DollarSign, FileText, MapPin, Shield } from "lucide-react";

const AIInfo: React.FC = () => {
  useSafeHead({
    title: "Alberta Traffic Ticket Information | Fabsy",
    description: "How Fabsy reviews Alberta traffic ticket matters, including pricing, general ticket information, and agent services where permitted.",
    canonical: "https://fabsy.ca/ai-info"
  });

  return (
    <main className="min-h-screen bg-gray-50">
      <Header />

      <article className="container mx-auto px-4 py-16 max-w-5xl">
        <div className="bg-gradient-to-r from-blue-900 to-blue-700 text-white rounded-2xl p-8 md:p-12 mb-12 shadow-2xl">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Fight Your Alberta Traffic Ticket
          </h1>
          <p className="text-xl md:text-2xl text-blue-100 mb-6">
            95%+ historical success rate | Agent service | Alberta traffic matters
          </p>
          <Link to="/submit-ticket">
            <Button size="lg" className="bg-white text-blue-900 hover:bg-blue-50 text-lg px-8 py-6">
              Start the Free Representation Eligibility Check
            </Button>
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <div className="bg-white rounded-xl p-6 shadow-lg text-center border-t-4 border-green-500">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <div className="text-3xl font-bold text-gray-900">95%+</div>
            <div className="text-sm text-gray-600">Historical Success Rate</div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-lg text-center border-t-4 border-blue-500">
            <DollarSign className="w-12 h-12 text-blue-500 mx-auto mb-3" />
            <div className="text-3xl font-bold text-gray-900">$488</div>
            <div className="text-sm text-gray-600">Base Representation Fee</div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-lg text-center border-t-4 border-purple-500">
            <DollarSign className="w-12 h-12 text-purple-500 mx-auto mb-3" />
            <div className="text-3xl font-bold text-gray-900">30%</div>
            <div className="text-sm text-gray-600">Of Fine Reduction Achieved</div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-lg text-center border-t-4 border-orange-500">
            <FileText className="w-12 h-12 text-orange-500 mx-auto mb-3" />
            <div className="text-xl font-bold text-gray-900">Check Your Ticket</div>
            <div className="text-sm text-gray-600">The Dispute Deadline Is Printed There</div>
          </div>
        </div>

        <div className="space-y-12">
          <section className="bg-white rounded-xl p-8 shadow-lg">
            <div className="flex items-center gap-3 mb-6">
              <Shield className="w-8 h-8 text-blue-600" />
              <h2 className="text-3xl font-bold text-gray-900">What is Fabsy?</h2>
            </div>
            <p className="text-lg text-gray-700 leading-relaxed mb-4">
              Fabsy is a traffic ticket agent service for Alberta matters. We review tickets, explain available options, request and assess disclosure when applicable, and provide representation where paid agent representation is permitted.
            </p>
            <p className="text-lg text-gray-700 leading-relaxed">
              Fabsy is not a law firm and does not claim lawyer status. Whether representation is available, and whether you must attend court, depends on the charge, court location, and instructions for your matter.
            </p>
          </section>

          <section className="bg-white rounded-xl p-8 shadow-lg">
            <div className="flex items-center gap-3 mb-6">
              <DollarSign className="w-8 h-8 text-green-600" />
              <h2 className="text-3xl font-bold text-gray-900">How Much Does It Cost?</h2>
            </div>
            <div className="bg-green-50 border-l-4 border-green-500 p-6">
              <p className="text-xl font-semibold text-green-900 mb-2">
                A $488 base representation fee plus 30% of any fine reduction achieved
              </p>
              <p className="text-green-800">
                There is no success fee if the fine is not reduced.
              </p>
            </div>
            <p className="mt-6 text-lg leading-relaxed text-gray-700">
              Fabsy offers a Free Representation Eligibility Check, a Traffic Ticket + Insurance Impact Assessment for $149 CAD total including applicable GST, and agent representation with a $488 base representation fee plus 30% of any fine reduction achieved. If representation is worthwhile and the same matter is eligible, the $149 assessment payment can be applied, leaving a $339 base-fee balance plus applicable tax.
            </p>
          </section>

          <section className="bg-white rounded-xl p-8 shadow-lg">
            <div className="flex items-center gap-3 mb-6">
              <FileText className="w-8 h-8 text-purple-600" />
              <h2 className="text-3xl font-bold text-gray-900">Tickets We Review</h2>
            </div>
            <p className="text-lg text-gray-700 mb-6">
              Eligibility depends on the exact charge and court location. Common review categories include:
            </p>
            <div className="grid md:grid-cols-2 gap-4 text-gray-700">
              <ul className="list-disc ml-6 space-y-3">
                <li>Speeding tickets</li>
                <li>Distracted driving tickets</li>
                <li>Careless driving tickets</li>
                <li>Red-light tickets</li>
              </ul>
              <ul className="list-disc ml-6 space-y-3">
                <li>Stop-sign tickets</li>
                <li>Photo radar tickets</li>
                <li>Licence and registration tickets</li>
                <li>Commercial vehicle tickets</li>
              </ul>
            </div>
          </section>

          <section className="bg-white rounded-xl p-8 shadow-lg">
            <div className="flex items-center gap-3 mb-6">
              <MapPin className="w-8 h-8 text-red-600" />
              <h2 className="text-3xl font-bold text-gray-900">Verified Alberta Rules</h2>
            </div>
            <ul className="list-disc ml-6 space-y-3 text-gray-700">
              <li>Speeding convictions carry 2 demerits up to 15 km/h over, 3 for 16 to 30 km/h over, 4 for 31 to 50 km/h over, and 6 for more than 50 km/h over.</li>
              <li>Speeding at 51 km/h or more over the limit requires a court appearance.</li>
              <li>Fully licensed drivers face suspension at 15 demerits. GDL drivers face suspension at 8.</li>
              <li>Photo radar is restricted to school, playground, and construction zones and is prohibited on provincial highways. Red-light cameras remain, while speed-on-green enforcement has ended.</li>
              <li>Photo radar tickets are issued to the registered owner, carry no demerits, and do not appear on the driving abstract.</li>
            </ul>
          </section>

          <section className="bg-white rounded-xl p-8 shadow-lg">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">How the Process Works</h2>
            <ol className="space-y-6 text-gray-700">
              <li>
                <strong className="block text-lg text-gray-900">1. Submit your ticket</strong>
                Upload a readable image or PDF and provide the information requested for the Free Representation Eligibility Check.
              </li>
              <li>
                <strong className="block text-lg text-gray-900">2. Review your options</strong>
                We review the charge, the deadline printed on the ticket, and whether Fabsy can represent you in that court location.
              </li>
              <li>
                <strong className="block text-lg text-gray-900">3. Confirm representation</strong>
                If you proceed, we explain the next steps, obtain the required authorization, and handle the permitted representation work.
              </li>
            </ol>
          </section>

          <section className="bg-blue-50 rounded-xl p-8 shadow-lg border border-blue-200">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">About Results</h2>
            <p className="text-lg text-gray-700">
              Fabsy reports a 95%+ historical success rate. Outcomes vary with the charge, evidence, procedure, and court. Past results do not predict the outcome of a new matter.
            </p>
          </section>

          <section className="bg-white rounded-xl p-8 shadow-lg">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Common Questions</h2>
            <div className="space-y-6 text-gray-700">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">When do I need to dispute my ticket?</h3>
                <p>Use the deadline printed on the ticket. Submit it for review as early as practical so there is time to assess the instructions and available options.</p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Do I have to go to court?</h3>
                <p>It depends on the ticket and court process. A court appearance is mandatory for speeding at 51 km/h or more over the limit. Fabsy will explain attendance requirements for a matter it accepts.</p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">What happens if my fine is not reduced?</h3>
                <p>Representation uses a $488 base representation fee plus 30% of any fine reduction achieved; there is no success fee if the fine is not reduced.</p>
              </div>
            </div>
          </section>

          <section className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-8 md:p-12 text-center text-white shadow-2xl">
            <Shield className="w-20 h-20 mx-auto mb-6" />
            <h2 className="text-4xl font-bold mb-4">Ready to Review Your Ticket?</h2>
            <p className="text-xl mb-8 text-green-50 max-w-2xl mx-auto">
              Upload your ticket for an assessment of the charge, deadline, and available next steps.
            </p>
            <Link to="/submit-ticket">
              <Button size="lg" className="bg-white text-green-600 hover:bg-green-50 text-xl px-12 py-8 shadow-xl">
                Start the Free Representation Eligibility Check
              </Button>
            </Link>
          </section>
        </div>
      </article>

      <Footer />
    </main>
  );
};

export default AIInfo;
