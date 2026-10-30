const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const path = require('path');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// CONEXIÓN BASE DE DATOS
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root', 
    password: 'root', // <--- TU CONTRASEÑA
    database: 'cosas_nerds_db',
    allowPublicKeyRetrieval: true
});

db.connect((err) => {
    if (err) console.error('Error BD:', err.message);
    else console.log('Conectado a MySQL');
});

function requireAdmin(req, res, next) {
    const rol = String(req.headers['x-rol'] || req.headers['x-role'] || '').toLowerCase();
    if (rol !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
    next();
}

// Tabla de registro de mal comportamiento (reportes/sanciones internas)
db.query(`
    CREATE TABLE IF NOT EXISTS mal_comportamiento (
        id INT AUTO_INCREMENT PRIMARY KEY,
        autor_nombre VARCHAR(255) NOT NULL,
        autor_nick VARCHAR(255),
        motivo TEXT,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`, (err) => {
    if (err) console.error('Error creando tabla mal_comportamiento:', err.message);
});

// --- RUTAS DE AUTENTICACIÓN ---
app.post('/register', async (req, res) => {
    const { nombre, usuario, password } = req.body;
    if (!nombre || !usuario || !password) return res.status(400).json({ msg: 'Faltan datos' });

    db.query('SELECT * FROM usuarios WHERE usuario = ?', [usuario], async (err, result) => {
        if (result.length > 0) return res.status(409).json({ msg: 'Usuario existe' });
        const passEncriptada = await bcrypt.hash(password, 8);
        db.query('INSERT INTO usuarios SET ?', { nombre, usuario, password: passEncriptada, rol: 'user' }, (error) => {
            if (error) return res.status(500).json({ msg: 'Error BD' });
            res.status(200).json({ msg: 'Registro exitoso' });
        });
    });
});

app.post('/login', (req, res) => {
    const { usuario, password } = req.body;
    db.query('SELECT * FROM usuarios WHERE usuario = ?', [usuario], async (err, results) => {
        if (results.length === 0 || !(await bcrypt.compare(password, results[0].password))) {
            return res.status(401).json({ msg: 'Datos incorrectos' });
        }
        res.status(200).json({
            msg: 'Bienvenido',
            nombre: results[0].nombre,
            nick: results[0].usuario,
            rol: results[0].rol
        });
    });
});

// --- RUTAS DE CONTACTO ---
app.post('/api/contacto', (req, res) => {
    const { email, nombre, telefono, mensaje } = req.body;
    db.query('INSERT INTO mensajes_contacto (email, nombre, telefono, mensaje) VALUES (?, ?, ?, ?)', [email, nombre, telefono, mensaje], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ msg: 'Mensaje enviado' });
    });
});

app.get('/api/admin/mensajes', requireAdmin, (req, res) => {
    db.query('SELECT * FROM mensajes_contacto ORDER BY fecha DESC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// --- RUTAS DE FORO ---
app.get('/api/foro', (req, res) => {
    const sql = `
        SELECT f.*, COUNT(r.id) AS num_respuestas
        FROM foro f
        LEFT JOIN respuestas_foro r ON r.id_foro = f.id
        GROUP BY f.id
        ORDER BY f.fecha DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.get('/api/foro/tema/:id', (req, res) => {
    db.query('SELECT * FROM foro WHERE id = ?', [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!results.length) return res.status(404).json({ error: 'Tema no encontrado' });
        res.json(results[0]);
    });
});

// Actividad del usuario en el foro (preguntas propias y si ya tienen respuestas)
app.get('/api/mis-actividad-foro/:autor', (req, res) => {
    const autor = req.params.autor;
    const sql = `
        SELECT f.id, f.titulo, f.fecha, COUNT(r.id) AS num_respuestas
        FROM foro f
        LEFT JOIN respuestas_foro r ON r.id_foro = f.id
        WHERE f.autor = ?
        GROUP BY f.id, f.titulo, f.fecha
        ORDER BY f.fecha DESC
    `;
    db.query(sql, [autor], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.post('/api/foro', (req, res) => {
    const { titulo, contenido, autor } = req.body;
    db.query('INSERT INTO foro (titulo, contenido, autor) VALUES (?, ?, ?)', [titulo, contenido, autor], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ msg: 'Tema publicado' });
    });
});

app.get('/api/foro/:id/respuestas', (req, res) => {
    db.query('SELECT * FROM respuestas_foro WHERE id_foro = ? ORDER BY fecha ASC', [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.post('/api/foro/respuestas', (req, res) => {
    const { id_foro, autor, contenido } = req.body;
    db.query('INSERT INTO respuestas_foro (id_foro, autor, contenido) VALUES (?, ?, ?)', [id_foro, autor, contenido], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ msg: 'Respuesta guardada' });
    });
});

// Admin: gestión de foro (eliminar temas/respuestas)
app.get('/api/admin/foro', requireAdmin, (req, res) => {
    const sql = `
        SELECT f.*, COUNT(r.id) AS num_respuestas
        FROM foro f
        LEFT JOIN respuestas_foro r ON r.id_foro = f.id
        GROUP BY f.id
        ORDER BY f.fecha DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.delete('/api/admin/foro/:id', requireAdmin, (req, res) => {
    const id = req.params.id;
    db.query('DELETE FROM respuestas_foro WHERE id_foro = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.query('DELETE FROM foro WHERE id = ?', [id], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ msg: 'Tema eliminado' });
        });
    });
});

app.delete('/api/admin/foro/respuestas/:id', requireAdmin, (req, res) => {
    db.query('DELETE FROM respuestas_foro WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ msg: 'Respuesta eliminada' });
    });
});

// --- RUTAS DE PEDIDOS Y TIENDA ---
app.post('/api/pedidos', (req, res) => {
    const { usuario, articulos, total } = req.body;
    const sql = 'INSERT INTO pedidos (usuario, articulos, total, estado) VALUES (?, ?, ?, ?)';
    db.query(sql, [usuario, JSON.stringify(articulos), total, 'Pendiente'], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json({ msg: 'Pedido registrado' });
    });
});

app.get('/api/admin/pedidos', requireAdmin, (req, res) => {
    db.query('SELECT * FROM pedidos ORDER BY fecha DESC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// NUEVO: Ver pedidos de un usuario específico (Para el Dashboard)
app.get('/api/mis-pedidos/:usuario', (req, res) => {
    db.query('SELECT * FROM pedidos WHERE usuario = ? ORDER BY fecha DESC', [req.params.usuario], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// NUEVO: Actualizar el estado del pedido (Para el Admin)
app.put('/api/admin/pedidos/:id/estado', requireAdmin, (req, res) => {
    const { estado } = req.body;
    db.query('UPDATE pedidos SET estado = ? WHERE id = ?', [estado, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ msg: 'Estado actualizado' });
    });
});

// Admin: eliminar pedido
app.delete('/api/admin/pedidos/:id', requireAdmin, (req, res) => {
    db.query('DELETE FROM pedidos WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ msg: 'Pedido eliminado' });
    });
});

// --- Admin: gestión de usuarios ---
app.get('/api/admin/usuarios', requireAdmin, (req, res) => {
    const sql = `
        SELECT
            u.nombre,
            u.usuario AS nick,
            u.rol,
            (SELECT COUNT(*) FROM respuestas_foro r WHERE r.autor = u.nombre) AS num_respuestas,
            (SELECT COUNT(*) FROM mal_comportamiento mc WHERE mc.autor_nombre = u.nombre) AS num_mal_comportamiento
        FROM usuarios u
        ORDER BY u.rol DESC, u.nombre ASC
    `;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.get('/api/admin/mal-comportamiento/:nick', requireAdmin, (req, res) => {
    const nick = req.params.nick;
    const sql = `
        SELECT mc.*
        FROM mal_comportamiento mc
        WHERE mc.autor_nick = ?
        ORDER BY mc.fecha DESC
    `;
    db.query(sql, [nick], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.delete('/api/admin/mal-comportamiento/:id', requireAdmin, (req, res) => {
    db.query('DELETE FROM mal_comportamiento WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ msg: 'Registro eliminado' });
    });
});

// Admin: eliminar usuario y contenido asociado
app.delete('/api/admin/usuarios/:nick', requireAdmin, (req, res) => {
    const nick = req.params.nick;

    db.query('SELECT * FROM usuarios WHERE usuario = ?', [nick], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!results.length) return res.status(404).json({ error: 'Usuario no encontrado' });

        // No permitir eliminar administradores (ni a sí mismos ni a otros)
        if (results[0].rol && String(results[0].rol).toLowerCase() === 'admin') {
            return res.status(403).json({ error: 'No se pueden eliminar cuentas de administrador' });
        }

        const nombre = results[0].nombre;

        // Limpiar contenido asociado del usuario
        db.query('DELETE FROM respuestas_foro WHERE autor = ?', [nombre], (err1) => {
            if (err1) return res.status(500).json({ error: err1.message });

            db.query('DELETE FROM foro WHERE autor = ?', [nombre], (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });

                db.query('DELETE FROM pedidos WHERE usuario = ?', [nombre], (err3) => {
                    if (err3) return res.status(500).json({ error: err3.message });

                    db.query('DELETE FROM mal_comportamiento WHERE autor_nombre = ?', [nombre], (err4) => {
                        if (err4) return res.status(500).json({ error: err4.message });

                        db.query('DELETE FROM usuarios WHERE usuario = ?', [nick], (err5) => {
                            if (err5) return res.status(500).json({ error: err5.message });
                            res.json({ msg: 'Usuario eliminado' });
                        });
                    });
                });
            });
        });
    });
});

app.listen(port, () => {
    console.log(`🚀 Servidor listo en http://localhost:${port}`);
});