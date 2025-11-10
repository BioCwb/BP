import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';

interface PurchaseFichasModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PaymentConfig {
    pixKey: string;
    merchantName: string;
    merchantCity: string;
    whatsappNumber: string;
}

// Function to calculate CRC16 for Pix BR Code
const crc16 = (data: string): string => {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return ('0000' + (crc & 0xFFFF).toString(16).toUpperCase()).slice(-4);
};

// Generates a static Pix BR Code payload
const generateBrCode = (key: string, merchantName: string, merchantCity: string): string => {
    const payloadFormatIndicator = '000201';
    
    const merchantAccountInfo = [
        '0014br.gov.bcb.pix', // GUI
        `01${key.length.toString().padStart(2, '0')}${key}` // PIX Key
    ].join('');
    const merchantAccountInfoFormatted = `26${merchantAccountInfo.length.toString().padStart(2, '0')}${merchantAccountInfo}`;

    const merchantCategoryCode = '52040000';
    const transactionCurrency = '5303986'; // BRL
    const countryCode = '5802BR';
    const merchantNameFormatted = `59${merchantName.length.toString().padStart(2, '0')}${merchantName}`;
    const merchantCityFormatted = `60${merchantCity.length.toString().padStart(2, '0')}${merchantCity}`;
    const crcId = '6304';

    const payload = [
        payloadFormatIndicator,
        merchantAccountInfoFormatted,
        merchantCategoryCode,
        transactionCurrency,
        countryCode,
        merchantNameFormatted,
        merchantCityFormatted,
        crcId
    ].join('');
    
    const crcResult = crc16(payload);

    return `${payload}${crcResult}`;
};

export const PurchaseFichasModal: React.FC<PurchaseFichasModalProps> = ({ isOpen, onClose }) => {
    const [brCode, setBrCode] = useState('');
    const [copied, setCopied] = useState(false);
    const [config, setConfig] = useState<PaymentConfig | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (isOpen) {
            setIsLoading(true);
            const configDocRef = db.collection('configs').doc('payment');
            configDocRef.get().then(doc => {
                if (doc.exists) {
                    setConfig(doc.data() as PaymentConfig);
                } else {
                    setConfig(null); // No config found
                }
            }).catch(err => {
                console.error("Error fetching payment config:", err);
                setConfig(null);
            }).finally(() => {
                setIsLoading(false);
            });
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && config && config.pixKey && config.merchantName && config.merchantCity) {
            const code = generateBrCode(
                config.pixKey,
                config.merchantName,
                config.merchantCity.replace(/\s/g, '').substring(0, 15).toUpperCase()
            );
            setBrCode(code);
            setCopied(false);
        } else {
            setBrCode('');
        }
    }, [isOpen, config]);

    const handleCopy = () => {
        if (brCode) {
            navigator.clipboard.writeText(brCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (!isOpen) return null;

    const renderContent = () => {
        if (isLoading) {
            return <p className="text-center text-lg">Carregando informações de pagamento...</p>;
        }

        if (!config || !config.pixKey) {
            return (
                <div className="text-center">
                    <h4 className="text-xl font-bold text-yellow-400 mb-4">Pagamento Indisponível</h4>
                    <p className="text-gray-300">
                        O sistema de compra de fichas via Pix não está disponível no momento. Por favor, tente novamente mais tarde.
                    </p>
                </div>
            );
        }

        return (
            <>
                <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                    <div className="text-center flex-shrink-0">
                        <h4 className="font-semibold mb-2">1. Escaneie o QR Code</h4>
                        {brCode ? (
                            <img 
                                src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(brCode)}&size=200x200&bgcolor=1F2937&color=FFFFFF`}
                                alt="PIX QR Code" 
                                className="rounded-lg border-4 border-gray-700"
                            />
                        ) : (
                            <div className="w-[200px] h-[200px] bg-gray-700 flex items-center justify-center rounded-lg">
                                <p>Gerando...</p>
                            </div>
                        )}
                        <p className="text-sm mt-2 text-gray-400">Nome: {config.merchantName}</p>
                    </div>
                    
                    <div className="flex-grow w-full">
                        <h4 className="font-semibold mb-2 text-center md:text-left">2. Ou use o Copia e Cola</h4>
                        <div className="bg-gray-900 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-300 mb-2">Chave Pix</p>
                            <p className="font-mono text-lg text-green-400 break-words">{config.pixKey}</p>
                        </div>
                        <button 
                            onClick={handleCopy}
                            className="w-full mt-2 py-2 px-4 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition-colors duration-300"
                        >
                            {copied ? 'Copiado!' : 'Copiar Código Pix'}
                        </button>

                        <div className="mt-4 pt-4 border-t border-gray-700">
                             <h4 className="font-semibold mb-2 text-center md:text-left">3. Envie o Comprovante</h4>
                             <p className="text-sm text-gray-300 text-center md:text-left">
                                Após o pagamento, envie o comprovante para o nosso WhatsApp para receber suas fichas.
                             </p>
                             <p className="text-center md:text-left mt-2 py-2 px-4 bg-blue-600 rounded-lg font-bold text-lg">
                                {config.whatsappNumber || '(XX) XXXXX-XXXX'}
                             </p>
                        </div>
                    </div>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-700">
                    <h4 className="font-semibold text-center mb-3">Pacotes de Fichas</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
                        <div className="bg-gray-700 p-3 rounded-lg flex flex-col justify-between">
                            <p className="font-bold text-lg">R$ 5</p>
                            <p className="text-yellow-400">50 Fichas</p>
                        </div>
                        <div className="bg-gray-700 p-3 rounded-lg flex flex-col justify-between">
                            <p className="font-bold text-lg">R$ 10</p>
                            <p className="text-yellow-400">110 Fichas</p>
                            <p className="text-xs text-green-400">+10% Bônus</p>
                        </div>
                         <div className="bg-gray-700 p-3 rounded-lg flex flex-col justify-between">
                            <p className="font-bold text-lg">R$ 20</p>
                            <p className="text-yellow-400">230 Fichas</p>
                            <p className="text-xs text-green-400">+15% Bônus</p>
                        </div>
                        <div className="relative bg-purple-800 p-3 rounded-lg border-2 border-yellow-400 shadow-lg flex flex-col justify-between">
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-400 text-purple-900 px-3 py-0.5 rounded-full text-xs font-bold">
                                OFERTA
                            </div>
                            <p className="font-bold text-lg mt-2">R$ 30</p>
                            <p className="text-yellow-400">360 Fichas</p>
                            <p className="text-xs text-green-400">+20% Bônus</p>
                        </div>
                         <div className="bg-gray-700 p-3 rounded-lg flex flex-col justify-between">
                            <p className="font-bold text-lg">R$ 50</p>
                            <p className="text-yellow-400">600 Fichas</p>
                            <p className="text-xs text-green-400">+20% Bônus</p>
                        </div>
                        <div className="bg-gray-700 p-3 rounded-lg flex flex-col justify-between">
                            <p className="font-bold text-lg">R$ 100</p>
                            <p className="text-yellow-400">1300 Fichas</p>
                            <p className="text-xs text-green-400">+30% Bônus</p>
                        </div>
                    </div>
                </div>
            </>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg text-white border border-gray-700 relative">
                <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-white text-3xl leading-none">&times;</button>
                <h3 className="text-2xl font-bold text-center text-purple-400 mb-4">Comprar Fichas com Pix</h3>
                {renderContent()}
            </div>
        </div>
    );
};