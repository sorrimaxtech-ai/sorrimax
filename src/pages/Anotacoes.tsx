import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, FileText, Trash2, Tag } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  date: string;
}

const mockNotes: Note[] = [
  {
    id: "1",
    title: "Protocolo de Atendimento",
    content: "Sempre confirmar agendamento 24h antes...",
    tags: ["processo", "atendimento"],
    date: "26/12/2024"
  },
  {
    id: "2",
    title: "Fornecedores Aprovados",
    content: "Lista de fornecedores homologados para produtos...",
    tags: ["compras", "fornecedores"],
    date: "20/12/2024"
  }
];

const Anotacoes = () => {
  const [notes] = useState<Note[]>(mockNotes);
  const [selectedNote, setSelectedNote] = useState<Note | null>(notes[0]);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredNotes = notes.filter((note) =>
    note.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex min-h-full bg-gray-50 dashboard-theme">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Anotações</h1>
            <p className="text-gray-600 mt-1">Gerencie notas e documentos da clínica</p>
          </div>

          <Tabs defaultValue="notes" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="notes">Bloco de Notas</TabsTrigger>
              <TabsTrigger value="documents">Documentos Anexados</TabsTrigger>
            </TabsList>

            {/* Bloco de Notas */}
            <TabsContent value="notes">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Lista de Notas */}
                <Card className="border-gray-100 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900">Notas</h3>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="relative mb-4">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Buscar notas..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>

                    <div className="space-y-2">
                      {filteredNotes.map((note) => (
                        <div
                          key={note.id}
                          onClick={() => setSelectedNote(note)}
                          className={`p-3 rounded-lg cursor-pointer transition-colors ${
                            selectedNote?.id === note.id
                              ? "bg-emerald-50 border border-emerald-200"
                              : "hover:bg-gray-50 border border-transparent"
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-sm text-gray-900">{note.title}</h4>
                              <p className="text-xs text-gray-500 mt-1">{note.date}</p>
                            </div>
                            <FileText className="h-4 w-4 text-gray-400" />
                          </div>
                          <div className="flex gap-1 mt-2">
                            {note.tags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Editor de Nota */}
                <Card className="lg:col-span-2 border-gray-100 shadow-sm">
                  <CardContent className="p-6">
                    {selectedNote ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Input
                            value={selectedNote.title}
                            className="text-xl font-semibold border-0 px-0 focus-visible:ring-0"
                            placeholder="Título da nota"
                          />
                          <Button variant="outline" size="sm" className="text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <Textarea
                          value={selectedNote.content}
                          className="min-h-[400px] resize-none"
                          placeholder="Conteúdo da nota..."
                        />

                        <div className="flex items-center gap-2">
                          <Tag className="h-4 w-4 text-gray-400" />
                          <div className="flex gap-2">
                            {selectedNote.tags.map((tag) => (
                              <Badge key={tag} variant="secondary">
                                {tag}
                              </Badge>
                            ))}
                            <Button variant="outline" size="sm">
                              + Tag
                            </Button>
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-4 border-t">
                          <Button variant="outline">Cancelar</Button>
                          <Button className="bg-emerald-600 hover:bg-emerald-700">Salvar</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-gray-500">
                        <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
                        <p>Selecione uma nota para editar</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Documentos */}
            <TabsContent value="documents">
              <Card className="border-gray-100 shadow-sm">
                <CardContent className="p-6">
                  <div className="text-center py-12">
                    <FileText className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Documentos Anexados</h3>
                    <p className="text-gray-600 mb-6">Faça upload de documentos importantes da clínica</p>
                    <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                      <Plus className="h-4 w-4" />
                      Upload de Documento
                    </Button>
                    <div className="mt-6 text-sm text-gray-500">
                      Armazenamento: 0 GB / 5 GB
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default Anotacoes;
