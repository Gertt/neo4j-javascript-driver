/**
 * Copyright (c) 2002-2016 "Neo Technology,"
 * Network Engine for Objects in Lund AB [http://neotechnology.com]
 *
 * This file is part of Neo4j.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import Session from './session';
import {Pool} from './internal/pool';
import {connect} from "./internal/connector";

/**
  * A Driver instance is used for mananging {@link Session}s.
  * @access public
  */
class Driver {
  /**
   * @constructor
   * @param {string} url
   * @param {string} userAgent
   * @param {Object} token
   */
  constructor(url, userAgent, token) {
    this._url = url;
    this._userAgent = userAgent || 'neo4j-javascript/0.0';
    this._openSessions = {};
    this._sessionIdGenerator = 0;
    this._token = token || {};
    this._pool = new Pool(
      this._createConnection.bind(this),
      this._destroyConnection.bind(this),
      this._validateConnection.bind(this)
    );
  }

  /**
   * Create a new connection instance.
   * @return {Connection} new connector-api session instance, a low level session API.
   * @access private
   */
  _createConnection( release ) {
    let sessionId = this._sessionIdGenerator++;
    let conn = connect(this._url);
    conn.initialize(this._userAgent, this._token);
    conn._id = sessionId;
    conn._release = () => release(conn);

    this._openSessions[sessionId] = conn;
    return conn;
  }

  /**
   * Check that a connection is usable
   * @return {boolean} true if the connection is open
   * @access private
   **/
  _validateConnection( conn ) {
    return conn.isOpen();
  }

  /**
   * Dispose of a live session, closing any associated resources.
   * @return {Session} new session.
   * @access private
   */
  _destroyConnection( conn ) {
    delete this._openSessions[conn._id];
    conn.close();
  }

  /**
   * Create and return new session
   * @return {Session} new session.
   */
  session() {
    let conn = this._pool.acquire();
    return new Session( conn, (cb) => {
      // This gets called on Session#close(), and is where we return
      // the pooled 'connection' instance.

      // We don't pool Session instances, to avoid users using the Session
      // after they've called close. The `Session` object is just a thin
      // wrapper around Connection anyway, so it makes little difference.

      // Queue up a 'reset', to ensure the next user gets a clean
      // session to work with. No need to flush, this will get sent
      // along with whatever the next thing the user wants to do with
      // this session ends up being, so we save the network round trip.
      conn.reset();

      // Return connection to the pool
      conn._release();

      // Call user callback
      if(cb) { cb(); }
    });
  }

  /**
   * Close sessions connections
   * @return
   */
  close() {
    for (let sessionId in this._openSessions) {
      if (this._openSessions.hasOwnProperty(sessionId)) {
        this._openSessions[sessionId].close();
      }
    }
  }
}

export default Driver
