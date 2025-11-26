import React from 'react';
import { TicketIcon } from './icons/TicketIcon';
import { PlayIcon } from './icons/PlayIcon';
import { TrophyIcon } from './icons/TrophyIcon';
import { CoinIcon } from './icons/CoinIcon';

interface HowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HowToPlayModal: React.FC<HowToPlayModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-2xl text-white border border-gray-700 relative max-h-[90vh] overflow-y-auto">
        <button 
            onClick={onClose} 
            className="absolute top-4 right-4 text-gray-400 hover:text-white text-3xl leading-none transition-colors focus:outline-none"
            aria-label="Fechar"
        >
            &times;
        </button>
        
        <h2 className="text-3xl font-bold text-center text-purple-400 mb-8">Como Jogar Bingo</h2>
        
        <div className="space-y-8">
            
            <section className="flex gap-4">
                <div className="flex-shrink-0 bg-purple-900/50 p-3 rounded-lg h-fit border border-purple-500/30">
                    <TrophyIcon className="w-8 h-8 text-yellow-400" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white mb-2">1. Objetivo</h3>
                    <p className="text-gray-300 leading-relaxed">
                        O objetivo do jogo é preencher <strong>toda a cartela</strong> (24 números + espaço grátis). 
                        Esta modalidade é conhecida como "Blackout" ou "Cartela Cheia". O primeiro jogador a completar todos os números vence a rodada automaticamente.
                    </p>
                </div>
            </section>

            <section className="flex gap-4">
                <div className="flex-shrink-0 bg-green-900/50 p-3 rounded-lg h-fit border border-green-500/30">
                    <TicketIcon className="w-8 h-8 text-green-400" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white mb-2">2. Comprando Cartelas</h3>
                    <p className="text-gray-300 mb-2 leading-relaxed">
                        Antes do início da partida, enquanto o status for "Aguardando", você deve adquirir suas cartelas:
                    </p>
                    <ul className="list-disc list-inside text-gray-400 space-y-1 ml-1">
                        <li>Cada cartela custa <strong>10 Fichas (F)</strong>.</li>
                        <li>Você pode jogar com no máximo <strong>10 cartelas</strong> por rodada.</li>
                        <li>Quanto mais cartelas, maiores suas chances de completar o Bingo!</li>
                    </ul>
                </div>
            </section>

            <section className="flex gap-4">
                <div className="flex-shrink-0 bg-blue-900/50 p-3 rounded-lg h-fit border border-blue-500/30">
                    <PlayIcon className="w-8 h-8 text-blue-400" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white mb-2">3. O Jogo</h3>
                    <ul className="list-disc list-inside text-gray-400 space-y-2 ml-1 leading-relaxed">
                        <li>A partida inicia automaticamente quando há pelo menos 4 jogadores prontos, ou manualmente pelo administrador.</li>
                        <li>As bolas são sorteadas automaticamente pelo sistema.</li>
                        <li>Se você tiver o número sorteado, ele será destacado. Você pode clicar para marcar (para facilitar sua visualização), mas o sistema também verifica a vitória automaticamente.</li>
                    </ul>
                </div>
            </section>

            <section className="flex gap-4">
                <div className="flex-shrink-0 bg-yellow-900/50 p-3 rounded-lg h-fit border border-yellow-500/30">
                    <CoinIcon className="w-8 h-8 text-yellow-500" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white mb-2">4. Prêmios</h3>
                    <p className="text-gray-300 leading-relaxed">
                        O valor das cartelas vendidas contribui para o <strong>Prêmio Acumulado</strong>. 
                        Se houver mais de um vencedor na mesma bola final, o prêmio total é dividido igualmente entre todos os vencedores.
                    </p>
                </div>
            </section>

        </div>

        <div className="mt-8 text-center pt-6 border-t border-gray-700">
            <button 
                onClick={onClose} 
                className="py-3 px-8 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-bold transition-all duration-300 shadow-lg hover:shadow-purple-500/30 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50"
            >
                Entendi, Vamos Jogar!
            </button>
        </div>

      </div>
    </div>
  );
};